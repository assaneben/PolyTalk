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
"""Unit boundary tests; real Synapse enforcement lives in matrix.integration.mjs."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'deploy' / 'synapse'))
from synapse.api.errors import Codes
from synapse.module_api import NOT_SPAM
from polytalk_policy import PolytalkPolicy


class PolicyTests(unittest.IsolatedAsyncioTestCase):
    async def test_login_requires_strict_internal_authorization_and_denies_on_outage(self):
        self.assertEqual(await self.policy.check_login_for_spam('@alice:localhost', 'DEVICE', None, []), NOT_SPAM)
        self.assertTrue(self.api.http_client.post_json_get_json.call_args.args[0].endswith('/internal/auth/check'))
        for value in [{'allowed': False}, {'allowed': 'true'}, {}]:
            self.api.http_client.post_json_get_json.return_value = value
            self.assertEqual(await self.policy.check_login_for_spam('@alice:localhost', None, None, []), Codes.FORBIDDEN)
        self.api.http_client.post_json_get_json.side_effect = OSError('offline')
        self.assertEqual(await self.policy.check_login_for_spam('@alice:localhost', 'DEVICE', None, []), Codes.FORBIDDEN)

    def setUp(self):
        self.rules = {}
        self.api = SimpleNamespace(register_spam_checker_callbacks=lambda **kw: None,
                                   register_third_party_rules_callbacks=lambda **kw: self.rules.update(kw),
                                   http_client=SimpleNamespace(post_json_get_json=AsyncMock(return_value={'allowed': True})),
                                   get_room_state=AsyncMock(return_value={}))
        self.policy = PolytalkPolicy({'server_name': 'localhost', 'policy_url': 'http://host.docker.internal:3210/internal/evaluate', 'policy_secret': 's' * 43}, self.api)

    async def test_blocked_invitation_is_forbidden(self):
        self.api.http_client.post_json_get_json.return_value = {'allowed': False}
        self.assertEqual(await self.policy.user_may_invite('@alice:localhost', '@bob:localhost', '!r:localhost'), Codes.FORBIDDEN)

    async def test_allowlisted_invitation_is_allowed(self):
        self.assertEqual(await self.policy.user_may_invite('@alice:localhost', '@bob:localhost', '!r:localhost'), NOT_SPAM)

    async def test_unavailable_policy_denies_invitation(self):
        self.api.http_client.post_json_get_json.side_effect = OSError('unavailable')
        self.assertEqual(await self.policy.user_may_invite('@alice:localhost', '@bob:localhost', '!r:localhost'), Codes.FORBIDDEN)

    async def test_nonboolean_policy_result_denies(self):
        self.api.http_client.post_json_get_json.return_value = {'allowed': 'true'}
        self.assertEqual(await self.policy.user_may_invite('@alice:localhost', '@bob:localhost', '!r:localhost'), Codes.FORBIDDEN)

    async def test_one_local_recipient_rejects_whole_encrypted_event(self):
        self.api.get_room_state.return_value = {
            ('m.room.member', '@alice:localhost'): SimpleNamespace(content={'membership': 'join'}),
            ('m.room.member', '@bob:localhost'): SimpleNamespace(content={'membership': 'join'}),
            ('m.room.member', '@carol:localhost'): SimpleNamespace(content={'membership': 'join'}),
        }
        async def evaluate(url, payload, headers):
            # Carol rejects Alice; omitting her from evaluation must fail this
            # test by incorrectly accepting the event.
            return {'allowed': '@carol:localhost' not in payload['recipients']}
        self.api.http_client.post_json_get_json.side_effect = evaluate
        self.assertEqual(await self.policy.check_event_for_spam(self.event()), Codes.FORBIDDEN)

    async def test_room_state_failure_denies_encrypted_event(self):
        self.api.get_room_state.side_effect = OSError('unavailable')
        self.assertEqual(await self.policy.check_event_for_spam(self.event()), Codes.FORBIDDEN)

    async def test_allowed_encrypted_event_is_accepted(self):
        self.api.get_room_state.return_value = {('m.room.member', '@bob:localhost'): SimpleNamespace(content={'membership': 'join'})}
        self.assertEqual(await self.policy.check_event_for_spam(self.event()), NOT_SPAM)

    async def test_plaintext_message_never_falls_back(self):
        self.assertEqual(await self.policy.check_event_for_spam(self.event('m.room.message')), Codes.FORBIDDEN)

    async def test_room_profile_requires_private_megolm(self):
        for config in [{}, {'visibility': 'public', 'initial_state': self.encryption()}, {'initial_state': [{'type': 'm.room.encryption', 'state_key': '', 'content': {'algorithm': 'other'}}]}]:
            self.assertEqual(await self.policy.user_may_create_room('@alice:localhost', config), Codes.FORBIDDEN)
        self.assertEqual(await self.policy.user_may_create_room('@alice:localhost', {'visibility': 'private', 'initial_state': self.encryption()}), NOT_SPAM)

    async def test_public_join_rules_and_encryption_downgrade_are_denied(self):
        for event_type, content in [('m.room.join_rules', {'join_rule': 'public'}), ('m.room.encryption', {'algorithm': 'other'})]:
            self.assertEqual(await self.policy.check_event_for_spam(self.event(event_type, content)), Codes.FORBIDDEN)

    async def test_blocked_member_profile_and_control_metadata_are_denied(self):
        self.api.get_room_state.return_value = {('m.room.member', '@bob:localhost'): SimpleNamespace(content={'membership': 'join'})}
        self.api.http_client.post_json_get_json.return_value = {'allowed': False}
        for event_type, content in [
            ('m.room.member', {'membership': 'join', 'displayname': 'plaintext bypass', 'custom': 'body'}),
            ('m.room.power_levels', {'users': {}, 'custom': 'body'}),
            ('m.room.join_rules', {'join_rule': 'invite', 'custom': 'body'}),
            ('m.room.encryption', {'algorithm': 'm.megolm.v1.aes-sha2', 'custom': 'body'}),
            ('m.room.history_visibility', {'history_visibility': 'shared', 'custom': 'body'}),
            ('m.room.guest_access', {'guest_access': 'forbidden', 'custom': 'body'}),
        ]:
            with self.subTest(event_type=event_type):
                self.assertEqual(await self.policy.check_event_for_spam(self.event(event_type, content)), Codes.FORBIDDEN)

    async def test_unavailable_policy_rejects_member_profile_but_allows_minimal_departure(self):
        self.api.get_room_state.return_value = {('m.room.member', '@bob:localhost'): SimpleNamespace(content={'membership': 'join'})}
        self.api.http_client.post_json_get_json.side_effect = OSError('unavailable')
        for content in [{'membership': 'join', 'displayname': 'body'}, {'membership': 'leave', 'reason': 'body'}, {'membership': 'ban', 'custom': 'body'}]:
            self.assertEqual(await self.policy.check_event_for_spam(self.event('m.room.member', content)), Codes.FORBIDDEN)
        for membership in ['leave', 'ban']:
            self.assertEqual(await self.policy.check_event_for_spam(self.event('m.room.member', {'membership': membership})), NOT_SPAM)

    async def test_empty_room_bootstrap_remains_possible_without_policy(self):
        self.api.http_client.post_json_get_json.side_effect = OSError('unavailable')
        for event_type, content in [('m.room.create', {}), ('m.room.member', {'membership': 'join'}), ('m.room.power_levels', {'users': {}}), ('m.room.join_rules', {'join_rule': 'invite'})]:
            self.assertEqual(await self.policy.check_event_for_spam(self.event(event_type, content)), NOT_SPAM)

    async def test_registered_membership_hook_checks_all_current_recipients(self):
        state = {('m.room.member', '@bob:localhost'): SimpleNamespace(content={'membership': 'join'}),
                 ('m.room.member', '@carol:localhost'): SimpleNamespace(content={'membership': 'join'})}
        async def evaluate(url, payload, headers):
            return {'allowed': '@carol:localhost' not in payload['recipients']}
        self.api.http_client.post_json_get_json.side_effect = evaluate
        event = self.event('m.room.member', {'membership': 'join', 'displayname': 'body'})
        self.assertIn('check_event_allowed', self.rules)
        self.assertEqual(await self.rules['check_event_allowed'](event, state), (False, None))
        self.api.http_client.post_json_get_json.side_effect = None
        self.api.http_client.post_json_get_json.return_value = {'allowed': True}
        self.assertEqual(await self.rules['check_event_allowed'](event, state), (True, None))

    async def test_membership_hook_outage_preserves_only_content_free_departure(self):
        state = {('m.room.member', '@bob:localhost'): SimpleNamespace(content={'membership': 'join'})}
        self.api.http_client.post_json_get_json.side_effect = OSError('unavailable')
        self.assertIn('check_event_allowed', self.rules)
        for content in [{'membership': 'join', 'displayname': 'body'}, {'membership': 'leave', 'reason': 'body'}]:
            self.assertEqual(await self.rules['check_event_allowed'](self.event('m.room.member', content), state), (False, None))
        for membership in ['leave', 'ban']:
            self.assertEqual(await self.rules['check_event_allowed'](self.event('m.room.member', {'membership': membership}), state), (True, None))

    async def test_invited_content_free_self_join_is_not_a_profile_message(self):
        state = {('m.room.member', '@alice:localhost'): SimpleNamespace(content={'membership': 'invite'}),
                 ('m.room.member', '@bob:localhost'): SimpleNamespace(content={'membership': 'join'})}
        self.api.http_client.post_json_get_json.side_effect = OSError('unavailable')
        event = self.event('m.room.member', {'membership': 'join'})
        self.assertEqual(await self.rules['check_event_allowed'](event, state), (True, None))
        event.content['displayname'] = 'plaintext body'
        self.assertEqual(await self.rules['check_event_allowed'](event, state), (False, None))

    async def test_lifecycle_can_repeat_existing_profile_without_new_plaintext(self):
        profile = {'displayname': 'already visible', 'avatar_url': 'mxc://localhost/old'}
        state = {('m.room.member', '@alice:localhost'): SimpleNamespace(content={'membership': 'invite', **profile}),
                 ('m.room.member', '@bob:localhost'): SimpleNamespace(content={'membership': 'join'})}
        self.api.http_client.post_json_get_json.side_effect = OSError('unavailable')
        for membership in ['join', 'leave', 'ban']:
            event = self.event('m.room.member', {'membership': membership, **profile})
            self.assertEqual(await self.rules['check_event_allowed'](event, state), (True, None))
            event.content['displayname'] = 'new body'
            self.assertEqual(await self.rules['check_event_allowed'](event, state), (False, None))
        state[('m.room.member', '@alice:localhost')].content['membership'] = 'join'
        self.assertEqual(await self.rules['check_event_allowed'](self.event('m.room.member', {'membership': 'join', **profile}), state), (False, None))

    async def test_nonmembership_uses_spam_hook_without_duplicate_policy_decision(self):
        self.api.http_client.post_json_get_json.side_effect = OSError('unavailable')
        self.assertEqual(await self.rules['check_event_allowed'](self.event(), {}), (True, None))
        self.assertEqual(await self.policy.check_event_for_spam(self.event()), Codes.FORBIDDEN)

    @staticmethod
    def encryption():
        return [{'type': 'm.room.encryption', 'state_key': '', 'content': {'algorithm': 'm.megolm.v1.aes-sha2'}}]

    @staticmethod
    def event(event_type='m.room.encrypted', content=None):
        return SimpleNamespace(type=event_type, sender='@alice:localhost', state_key='@alice:localhost', room_id='!r:localhost', content=content or {'algorithm': 'm.megolm.v1.aes-sha2'})
