# Copyright (C) 2026 PolyTalk contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.
"""Polytalk's local, fail-closed Synapse policy boundary (Synapse 1.163).

Ciphertext stays opaque. One rejecting local joined recipient rejects the event
for the whole room: Matrix cannot selectively deliver one event within a room.
"""
from urllib.parse import urlsplit

from synapse.api.errors import Codes
from synapse.module_api import NOT_SPAM


class PolytalkPolicy:
    def __init__(self, config, api):
        self.api = api
        self.server_name = config['server_name']
        self.policy_url = config['policy_url']
        self.secret = config['policy_secret']
        url = urlsplit(self.policy_url)
        if (url.scheme not in ('http', 'https') or url.username or url.password
                or url.path != '/internal/evaluate' or url.query or url.fragment
                or not url.hostname or len(self.secret) < 32):
            raise ValueError('Invalid Polytalk policy configuration')
        api.register_spam_checker_callbacks(
            check_login_for_spam=self.check_login_for_spam,
            user_may_invite=self.user_may_invite,
            check_event_for_spam=self.check_event_for_spam,
            user_may_create_room=self.user_may_create_room,
            user_may_publish_room=self.user_may_publish_room,
        )
        # Synapse 1.163 membership updates bypass check_event_for_spam. The
        # public third-party hook covers that path; it is experimental, so the
        # pinned Synapse image and real membership regression gate are required
        # again before any server upgrade. Federation is disabled for this stack.
        api.register_third_party_rules_callbacks(check_event_allowed=self.check_event_allowed)

    async def check_login_for_spam(self, user_id, device_id, initial_display_name,
                                   request_info, auth_provider_id=None):
        if not self.local(user_id):
            return Codes.FORBIDDEN
        try:
            result = await self.api.http_client.post_json_get_json(
                self.policy_url.rsplit('/', 1)[0] + '/auth/check',
                {'user_id': user_id, 'device_id': device_id},
                headers={'X-Polytalk-Policy-Secret': [self.secret]},
            )
            return NOT_SPAM if isinstance(result, dict) and result.get('allowed') is True else Codes.FORBIDDEN
        except Exception:
            return Codes.FORBIDDEN

    def local(self, user_id):
        return isinstance(user_id, str) and user_id.startswith('@') and user_id.split(':', 1)[-1] == self.server_name

    async def evaluate(self, sender, recipients):
        try:
            result = await self.api.http_client.post_json_get_json(
                self.policy_url, {'sender': sender, 'recipients': sorted(recipients)},
                headers={'X-Polytalk-Policy-Secret': [self.secret]},
            )
            return isinstance(result, dict) and result.get('allowed') is True
        except Exception:
            # Network, HTTP errors, malformed JSON: never accept on failure.
            return False

    async def user_may_invite(self, inviter, invitee, room_id):
        if not self.local(inviter) or not self.local(invitee):
            return Codes.FORBIDDEN
        return NOT_SPAM if await self.evaluate(inviter, [invitee]) else Codes.FORBIDDEN

    async def check_event_for_spam(self, event):
        return await self.check_room_event(event)

    async def check_event_allowed(self, event, state_events):
        # Other events already pass through the spam hook. Avoid making their
        # authorization HTTP request twice.
        if event.type != 'm.room.member':
            return True, None
        result = await self.check_room_event(event, state_events)
        return result == NOT_SPAM, None

    async def check_room_event(self, event, state_events=None):
        if not self.local(event.sender):
            return Codes.FORBIDDEN
        if event.type == 'm.room.join_rules' and event.content.get('join_rule') != 'invite':
            return Codes.FORBIDDEN
        if event.type == 'm.room.encryption' and event.content.get('algorithm') != 'm.megolm.v1.aes-sha2':
            return Codes.FORBIDDEN
        bootstrap = {'m.room.create', 'm.room.member', 'm.room.power_levels',
                     'm.room.join_rules', 'm.room.encryption', 'm.room.history_visibility',
                     'm.room.guest_access'}
        if event.type == 'm.room.create':
            return NOT_SPAM
        # Leaving, declining, kicking and banning must remain possible on policy
        # outage. Only the minimal lifecycle payload is exempt: profile fields,
        # reasons and arbitrary extra keys can otherwise carry plaintext.
        if (event.type == 'm.room.member' and event.content.get('membership') in {'leave', 'ban'}
                and set(event.content) == {'membership'}):
            return NOT_SPAM
        # No plaintext or custom timeline fallback. Metadata events are also
        # subject to every recipient's current policy.
        if event.type not in bootstrap | {'m.room.encrypted', 'm.room.name', 'm.room.topic', 'm.room.avatar'}:
            return Codes.FORBIDDEN
        if event.type == 'm.room.encrypted' and event.content.get('algorithm') != 'm.megolm.v1.aes-sha2':
            return Codes.FORBIDDEN
        try:
            state = state_events if state_events is not None else await self.api.get_room_state(event.room_id, [('m.room.member', None)])
            if event.type == 'm.room.member':
                previous = state.get(('m.room.member', event.state_key))
                old_content = previous.content if previous is not None else {}
                membership = event.content.get('membership')
                # Joining an invitation and exiting/removing membership are
                # lifecycle operations. Synapse/clients can repeat a profile
                # already visible in prior state, but no changed/new profile,
                # reason or custom key may use this exemption.
                lifecycle = membership in {'leave', 'ban'} or (
                    membership == 'join' and event.state_key == event.sender
                    and old_content.get('membership') == 'invite')
                if (lifecycle and set(event.content) <= {'membership', 'displayname', 'avatar_url'}
                        and all(key in old_content and value == old_content[key]
                                for key, value in event.content.items() if key != 'membership')):
                    return NOT_SPAM
            recipients = {user_id for (event_type, user_id), member in state.items()
                          if event_type == 'm.room.member' and self.local(user_id)
                          and user_id != event.sender and member.content.get('membership') == 'join'}
            # Initial control state and the creator's first join have no other
            # joined recipients. After bootstrap, control/profile updates are
            # messages to the room and need every recipient's current consent.
            if event.type in bootstrap and not recipients:
                return NOT_SPAM
            return NOT_SPAM if await self.evaluate(event.sender, recipients) else Codes.FORBIDDEN
        except Exception:
            return Codes.FORBIDDEN

    async def user_may_create_room(self, user_id, room_config):
        encrypted = any(item.get('type') == 'm.room.encryption' and item.get('state_key', '') == ''
                        and item.get('content', {}).get('algorithm') == 'm.megolm.v1.aes-sha2'
                        for item in room_config.get('initial_state', []))
        if not self.local(user_id) or room_config.get('visibility', 'private') != 'private' or not encrypted:
            return Codes.FORBIDDEN
        return NOT_SPAM

    async def user_may_publish_room(self, user_id, room_id):
        return Codes.FORBIDDEN
