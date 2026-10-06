# Attribution

The interface review applies Jakub Krehel’s **Better Interface** (MIT), pinned at `267330e1adfc66a718fb65fa6918c1f06d0a689e`. The implementation documentation method is adapted from Paul Bakaus’s **Impeccable** (Apache-2.0), pinned at `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Copyright 2025 Paul Bakaus). Both supplied license texts are retained in [licenses/design-guidance.txt](licenses/design-guidance.txt).

Sources: [Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface), [Impeccable documentation reference](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md).

The site bundles React, React DOM, and viem and their required runtime code. Runtime dependency licenses are preserved in [public/THIRD_PARTY_LICENSES.txt](public/THIRD_PARTY_LICENSES.txt), copied into `dist/` by Vite. Dependency source and package-manager caches are not vendored. The seat image and testament are read directly from the specified Ethereum contracts and are not supplied as local authored assets.
