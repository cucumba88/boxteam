# NSIS include backports

`Win/RestartManager.nsh` comes unmodified from NSIS 3.10 (Ubuntu package
`nsis-common_3.10-2ubuntu2`, zlib/libpng licence). Tauri's NSIS installer
template includes it, but the Ubuntu 22.04 runner ships NSIS 3.08, which does
not have it. `build-windows.yml` copies it into makensis' include folder only
when it is missing, so a newer NSIS keeps its own copy.
