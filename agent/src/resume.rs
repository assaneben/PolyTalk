// Copyright (C) 2026 PolyTalk contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
use crate::inbox::Result;
use std::path::Path;
pub fn require_crypto_store(directory: &Path, has_session: bool) -> Result<()> {
    if has_session {
        for name in ["matrix-sdk-crypto.sqlite3", "matrix-sdk-state.sqlite3"] {
            let path = directory.join(name);
            if !path.is_file() || std::fs::symlink_metadata(path)?.file_type().is_symlink() {
                return Err(
                    "Saved session requires its original crypto and state databases".into(),
                );
            }
        }
    }
    Ok(())
}

pub fn prepare_directory(path: &Path) -> Result<()> {
    use std::path::{Component, PathBuf};
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()?.join(path)
    };
    let mut current = PathBuf::new();
    for component in absolute.components() {
        if matches!(component, Component::ParentDir) {
            return Err("Parent traversal refused".into());
        }
        current.push(component.as_os_str());
        if current.exists() {
            let metadata = std::fs::symlink_metadata(&current)?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err("Linked or non-directory store path refused".into());
            }
        } else {
            let builder = std::fs::DirBuilder::new();
            #[cfg(unix)]
            let mut builder = builder;
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(&current)?;
        }
    }
    Ok(())
}
