# Contributing

Thanks for helping. R.O.U.G.E is meant to keep working when nothing else does, so:

- **Keep it offline.** Nothing may load from the internet at run time. Downloads belong in `install.sh` or `rouge-get`.
- **Keep it light.** The server is Go's standard library only; the web app is plain JavaScript with no build step. Think about a Pi on a power bank.
- **Keep it plain.** Write for someone who is stressed and tired: short sentences, clear steps.
- **Cite sources.** Field Guide content must come from a reputable source (CDC, EPA, Ready.gov, Red Cross, AHA, U.S. Army manuals and similar), named in the card's `source`. Paraphrase; don't copy text.

## Development

```sh
cd server
go test ./...
go run . -addr 127.0.0.1:8080 -data /tmp/rouge-dev
```

Open http://127.0.0.1:8080. Edit files in `server/web/` and restart (they're embedded into the binary).

Most new features fit best as a module: see [MODULES.md](MODULES.md).

## Pull requests

- One change per pull request, with a sentence on why.
- `go vet ./...` and `go test ./...` pass; shell scripts pass `bash -n` (and `shellcheck` if you have it).
- Include a screenshot for interface changes, at 1024×600 (a common cyberdeck screen) if you can.
