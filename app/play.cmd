@echo off
rem Serves the Library at top level, outside any iframe, which is the only way
rem the Pointer Lock API is available -- the published artifact renders in a
rem frame sandboxed "allow-scripts allow-same-origin allow-forms" with no
rem allow-pointer-lock, so real mouse capture can never be granted there.
rem
rem Node only; no Python and no packages. Ctrl+C stops it.
cd /d "%~dp0.."
start "" "http://127.0.0.1:8731/app/babel-phase1.html"
node tools/serve.mjs 8731
