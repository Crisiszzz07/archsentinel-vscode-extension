# Change Log

All notable changes to the "ArchSentinel" extension will be documented in this file.

## [1.0.0] - 2025-12-07

### Added

- 🚀 **Auto-Discovery:** New `ArchSentinel: Init / Auto-Detect` command to automatically generate `arch-rules.json` based on your project structure.
- 🕸️ **Impact Analysis:** Interactive graph visualization! Click a node to highlight its dependencies and dim the rest.
- 🎯 **Dart & Flutter Support:** Full support for Dart imports and package structure.
- 📊 **Instability Metrics:** Nodes are now color-coded based on their stability score (I-metric).
- 🛠️ **Robust Linter:** Improved relative path resolution and regex matching for all supported languages.

## [0.0.5] - 2025-12-06

### Added

- 🚀 **Architecture Visualization:** New interactive graph using Vis.js.
- 🛡️ **Clean Architecture Linter:** Real-time checking of import rules.
- ⚡ **Cycle Detection:** Automatic detection of circular dependencies.
- 🎨 **Status Bar:** Visual indicator of project health.
- 🔧 **Quick Fixes:** Support for `// arch-ignore` comments via Code Actions.

### Fixed

- Fixed issue with relative paths in monorepos.
- Improved graph physics performance.
