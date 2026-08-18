<div align="center">

# Bench Studio

### Stop renting the wrapper. Own the creative layer.

A local-first creative studio for images, videos, websites, designed PDFs, and AI-agent workflows.

[![MIT License](https://img.shields.io/badge/license-MIT-6D7CFF.svg)](LICENSE)
![Node 22.5+](https://img.shields.io/badge/node-22.5%2B-171A21.svg)
![73 model routes](https://img.shields.io/badge/model_routes-73-6D7CFF.svg)
![5 providers](https://img.shields.io/badge/providers-5-6D7CFF.svg)
![MCP ready](https://img.shields.io/badge/MCP-ready-171A21.svg)

**This README installs, runs and maintains the studio.** What it is and why it
works this way lives in **[docs/ABOUT.md](docs/ABOUT.md)**; the internals are in
**[docs/COMO-FUNCIONA.md](docs/COMO-FUNCIONA.md)**.

**[Install local](#install-a--local-machine)** · **[Install on a VPS](#install-b--vps-reachable-from-outside)** · **[Keep it running](#keep-it-running-systemd)** · **[Update](#updating-an-existing-install)** · **[API keys](#api-keys-what-is-required-and-how-to-change-them)** · **[Passwords](#passwords)** · **[Modes](#creation-modes-and-their-sub-controls)** · **[Maintenance](#maintenance)** · **[Remote access](#remote-access-reference-remotesh)** · **[Security](#security-and-privacy)**

</div>

## 📖 Guia de uso

Guia completo em português (landing + passo a passo): **https://inematds.github.io/bench-studio-br/guia/**

![Bench Studio model catalog](docs/bench-studio-models.png)

Bench Studio puts **73 curated image and video routes across 5 providers**, prompt refinement,
capability-aware controls, local file custody, and a transparent cost ledger
behind one interface. The same system is available to Claude, Codex, Cursor,
and other compatible clients through MCP.

Your keys stay server-side on your machine. Your prompts are editable before
you spend. Your outputs are mirrored locally. Your costs are recorded in real
units instead of disappearing into mystery credits.

> [!NOTE]
> This is the sanitized public distribution. It ships with no generation
> history, uploads, private database, personal paths, credentials, or local
> build artifacts. Your archive begins empty.

## Before anything: what you need

- **Node.js 22.5+** (24 recommended — the studio uses `node:sqlite`) and npm.
  Nothing else is required to start.
- **A provider, to generate anything.** Every one is optional and degrades on
  its own: a missing key marks those models unavailable, with the reason and the
  fix, and the studio still starts.

| Provider | Models | Cost | What you need |
|---|---|---|---|
| [fal.ai](https://fal.ai/dashboard/keys) | 37 | dollars, live pricing | `FAL_KEY` |
| [Kling](https://klingai.com) | 26 | plan credits | `npm i -g @klingai/cli-global && kling login` |
| [Agnes AI](https://apihub.agnes-ai.com) | 4 | zero | `AGNES_API_KEY` |
| [kie.ai](https://kie.ai/api-key) | 4 | credits | `KIE_API_KEY` |
| [inemaimg](https://github.com/inematds/inemaimg) | 2 | zero (your GPU) | a running local server |

Optional but worth it: a [Google AI Studio](https://aistudio.google.com/apikey)
or [OpenRouter](https://openrouter.ai/keys) key for prompt refinement (without
one your prompt is sent raw, and Agnes rejects anything not in English); Google
Chrome for PDF printing; a signed-in Codex or Claude Code for agent-driven
website and document builds.

**Then pick your path. They are separate on purpose — do one, top to bottom.**

| Your situation | Go to |
|---|---|
| It runs on the machine you sit at | [Install A — local machine](#install-a--local-machine) |
| It runs on a VPS or a machine you reach over the network | [Install B — VPS, reachable from outside](#install-b--vps-reachable-from-outside) |
| It works, and you want it to survive reboots | [Keep it running](#keep-it-running-systemd) |
| It works, and you want to update it | [Updating an existing install](#updating-an-existing-install) |

---

## Install A — local machine

For your own laptop or desktop. Nothing is published to the network: both ports
answer only `127.0.0.1`.

```bash
# 1. code and dependencies (node_modules does NOT come with the clone)
git clone https://github.com/inematds/bench-studio-br.git
cd bench-studio-br
npm install

# 2. credentials file (.env is gitignored, so the clone has none)
cp .env.example .env
#    fill in what you have — or leave it empty and use the Config screen later

# 3. start
npm run dev
```

Open **[http://localhost:5200](http://localhost:5200)**. There is no password:
talking to your own machine should not require one.

| Service | Address |
| --- | --- |
| Studio | `http://localhost:5200` |
| Local API | `http://localhost:8787` |
| Health and capability summary | `http://localhost:8787/api/health` |

Missing a key? The **Config** button (top right) shows every setting — present or
missing, where the value came from, its last 4 characters — tests each provider
and writes `.env` for you. See [API keys](#api-keys-what-is-required-and-how-to-change-them).

If a port is occupied the studio **fails and says so** instead of quietly moving
to the next one — a second interface nobody's firewall allows is worse than an
honest error:

```bash
PORT=8790 BENCH_API_PORT=8790 BENCH_WEB_PORT=5201 npm run dev
```

That is the whole local install. The sections below are for the network case and
do not apply to you.

---

## Install B — VPS, reachable from outside

Same first steps, plus three that only matter when someone other than you can
reach the port. Run it top to bottom; nothing here is optional.

```bash
# 1. code and dependencies
git clone https://github.com/inematds/bench-studio-br.git
cd bench-studio-br
npm install

# 2. credentials
cp .env.example .env      # fill in your keys

# 3. PASSWORD, before the port opens — this order matters, see below
npm run set-password

# 4. publish the interface + firewall rule
./scripts/remote.sh open

# 5. start it so it survives your SSH session ending
setsid nohup npm run dev > ~/bench.log 2>&1 < /dev/null &
sleep 12

# 6. verify — from the machine, then from your browser
./scripts/remote.sh status
ss -tlnp | grep 5200
```

Step 6 must show `0.0.0.0:5200`. If it shows `127.0.0.1:5200`, the interface did
not pick up `BENCH_WEB_HOST` — update first (see
[Updating](#updating-an-existing-install)); a version older than 2026-08-18 had
that bug, and `remote.sh` would report OPEN while the socket stayed local.

Then open `http://<your-ip>:5200` from your browser.

**Why the password comes before the port.** It can only be set from the machine
itself: `POST /api/config/password` answers 403 to anything not coming from
loopback, session or no session. That is what stops whoever finds an open port
from setting a password of their own and locking you out. After the port is
open, that gap cannot be closed from the other side — so the install is the
moment. `remote.sh open` offers to do it for you and says clearly when you
decline. Full rules in [Passwords](#passwords).

**What stays private.** Only the interface (5200) goes out. The API (8787) —
the port that writes files and spends money — stays on loopback. The deliberate
opt-out is `BENCH_API_HOST=0.0.0.0`, and you should have a reason.

**Closing it again**, when the test ends:

```bash
./scripts/remote.sh close
# then restart the studio, so the open socket is actually dropped
```

Read [Leaving it up safely](#leaving-it-up-safely) before you leave it up for
more than an afternoon: the traffic is plain HTTP, readable in transit, until
something in front of it terminates TLS.

---

## Keep it running (systemd)

Both installs above leave a process you started by hand. It survives your SSH
session (thanks to `setsid nohup`) but **not a reboot**, and `systemctl restart
bench-studio` fails with *Unit not found* because this project installs no
service. One script creates it:

```bash
./scripts/install-service.sh
```

It writes `/etc/systemd/system/bench-studio.service`, reloads systemd, drops any
process still holding the port, and enables plus starts the unit. It runs the
studio as the **owner of the repository** rather than as whoever typed `sudo`,
and freezes the Node directory into the unit's `PATH` — systemd's `PATH` is
minimal, and without that an nvm-installed Node fails with `npm: command not
found` in a place where only the journal would tell you.

```bash
sudo systemctl restart bench-studio    # now this exists
sudo journalctl -u bench-studio -f     # logs
./scripts/install-service.sh --print   # see the unit without installing
./scripts/install-service.sh --remove  # disable and delete it
```

If nginx or Caddy serves `npm run build`'s `dist/` and you only need the API
behind it:

```bash
./scripts/install-service.sh --serve build     # ExecStart becomes `npm run server`
```

## Updating an existing install

**Run these four, in this order. They are correct whichever way you start the
studio** — you do not need to know which mode you are in:

```bash
cd bench-studio-br
git pull
npm install       # no-op when nothing changed
npm run build     # no-op in practice if you never serve dist/
```

Then restart it **the same way you started it**. This project installs no
service, so `systemctl restart bench-studio` only works if you created that unit
yourself — see *Running it as a service* under Maintenance. If you started it by
hand:

```bash
pkill -f 'server/server.mjs'   # stops the studio (server + interface)
npm run dev                    # or however you keep it up
```

Not sure how it is running? This tells you:

```bash
ps -o pid,lstart,args -p $(pgrep -f 'server/server.mjs') 2>/dev/null
systemctl list-units --type=service | grep -i bench   # empty means no unit
```

Why `npm run build` is in the list even though most people run `npm run dev`:
`dist/` is not versioned, so `git pull` never updates a site that is served
pre-built. Running the build when you did not need it costs three seconds and
leaves an unused folder; skipping it when you did need it leaves the interface
frozen at the old version while the server updates underneath — which looks like
a bug and is not one. Building always is the cheaper mistake.

*(If you want to know anyway: if the command that keeps the studio up is
`npm run dev`, Vite serves from source and the build is unnecessary. If a web
server answers port 80/443 and proxies to the studio, it is serving `dist/` and
the build is required.)*

**One change can bite an existing install:** the API now binds to loopback by
default (`BENCH_API_HOST`). It used to listen on every interface, which meant
publishing the interface also published port 8787 — the one that writes files
and spends money. A reverse proxy on the same machine talking to
`127.0.0.1:8787` is unaffected. Anything reaching 8787 from another host will
stop working, and the deliberate opt-out is `BENCH_API_HOST=0.0.0.0` in `.env`.

`server/capabilities.json` is versioned but needs no manual step: it rebuilds
itself when a model's declared inputs change. After restarting on a machine that
is reachable from outside, `./scripts/remote.sh status` tells you in one line
whether the port is open, on what address, with or without a password, and
whether the firewall is on.

### What changed recently

| Area | Change |
| --- | --- |
| Reference frames | Models that accept a first and a last frame now show two named, numbered pickers instead of one anonymous list — 10 routes, including Kling's own (`--tailImage`, a CLI-side option that never appears in `who_am_i`). |
| Model picker | Filter by provider; search no longer cancels the output filter — the three criteria combine, and an escape hatch appears when they leave the list empty. Switching image/video no longer closes the panel, and the list opens scrolled to the model in use. |
| Capacity | Every model states what it accepts before you attach: *1 reference image*, *up to 10*, *first + last frame*. Taken from the endpoint schema, not a hand-written list. |
| Cost | An unknown billing unit no longer counts as one unit. Seedance 2.5 bills in "1000 tokens" and used to advertise a fixed $0.0214 for a 5s clip and for a 30s one alike; it is now reported as unquotable with the unit price in plain sight. |
| Attachments | References coming from `/previews` or `/projects` reached the provider as a raw path (`image must be a public http(s) URL`). All four static routes are resolved now, and an unresolvable one fails here, naming the missing file. |
| Errors | The Kling CLI writes every failure to stderr with an empty stdout. That stream was discarded, so every error read as "session expired". It is captured and shown. |
| Remote access | `scripts/remote.sh`, the sections above, and `docs/ACESSO-REMOTO.md`. A studio published *with* a password is no longer announced as having no authentication. |
| Catalog | No sample thumbnails; larger lane headings, one colour per route; filters and catalog-wide controls separated. |

## API keys: what is required, and how to change them

**Nothing is required together.** The studio starts with whatever exists and the
catalog explains what is unavailable and why. To generate anything at all you
need **one** of the five providers below; everything else is additive.

| Want to… | Minimum |
| --- | --- |
| Start the studio, browse the catalog, use MCP | nothing beyond Node |
| Generate images or video, cheapest useful setup | `AGNES_API_KEY` (free tier, English prompts only) |
| Generate with the widest catalog | `FAL_KEY` (37 routes, billed in dollars) |
| Generate on your own GPU | a running [inemaimg](https://github.com/inematds/inemaimg) at `INEMAIMG_URL` |
| Have prompts refined and translated | `GOOGLE_API_KEY` **or** `OPENROUTER_API_KEY` |
| Use Kling's own route | no key — `npm i -g @klingai/cli-global && kling login` |

Prompt refinement deserves a word: without any refiner your idea is sent raw,
and Agnes rejects Portuguese outright. It is optional in the code and close to
mandatory in practice.

`.env.example` documents all 17 variables — what each unlocks, how it bills and
where to create it. It is the reference; this table is only the shortest path.

### Three ways to set a key, one order of precedence

```
exported in your shell   >   .env in the project   >   ~/.env
```

That order is why the Config screen warns about *shadowed* values: writing a key
to `.env` that your shell already exports changes nothing until you restart
without the export. A save that silently does nothing is worse than a refusal.

1. **The Config screen** (button, top right) — shows every variable, whether it
   is present, where the value came from and its last 4 characters, tests each
   provider, and writes `.env` for you with `600` permissions. It never displays
   a value, and it only accepts writes from the machine running the studio.
2. **`.env` in the project** — `cp .env.example .env`, then edit. This is the
   file the Config screen writes and the one `remote.sh` touches.
3. **Exported in the shell** — useful for a one-off run or when a secret manager
   injects it:
   ```bash
   FAL_KEY=... npm run dev
   ```

### Rotating or replacing a key

```bash
# 1. change the value (Config screen, or edit .env)
# 2. restart — keys are read at boot
# restart the studio, however you run it (see Updating an existing install)
# 3. confirm from the machine
curl -s localhost:8787/api/health | head
```

The Config screen has a **Test** button per provider, which makes a real call
and reports what came back — the fastest way to tell a wrong key from an empty
balance. A provider whose key is missing or invalid does not break the studio:
its models are listed as unavailable, with the reason and the fix, and the rest
keeps working.

Removing a key is the same path: clear the field or the line, restart, and those
models go back to unavailable.

### Kling is the exception

It authenticates by OAuth through its own CLI, not by a key in `.env`:

```bash
npm i -g @klingai/cli-global
kling login
node server/providers/kling_sync.mjs   # re-reads the account's model list
```

The token lives in `~/.kling/`. If the session expires, generations fail with
the CLI's own message and `kling login` fixes it.

## Passwords

The studio ships **without one**, on purpose: talking to your own machine should
not require a login. The moment it stops being only your machine, this section
applies.

```bash
npm run set-password              # set or replace; takes effect immediately
npm run set-password -- --remove  # remove
```

- **Where it can be run: on the machine itself**, at the keyboard or over SSH.
  `POST /api/config/password` answers 403 to anything not coming from loopback —
  session or no session. That is not an oversight, it is the protection: it stops
  whoever finds an open port from setting a password of their own and locking the
  owner out. The Config screen says so instead of showing a dead field.
- **Stored as a scrypt hash** in `BENCH_PASSWORD`. Nobody reads your password out
  of `.env`.
- **No restart needed** to set or change it. Everyone else is signed out at once.
- **Forgot it?** Delete the `BENCH_PASSWORD` line from `.env` and restart. That
  recovery path exists on purpose: whoever has that file already has the provider
  keys inside it, so guarding the password harder than the file it lives in would
  protect nothing.
- **Set it before opening the port**, not after — see the sequence in the next
  section. `./scripts/remote.sh open` offers to do it for you, and says clearly
  when you decline.

What the password does and does not cover: it protects the API and your
generated files. The interface shell is still served to anyone who reaches the
port, but with no session it shows nothing. Hiding the shell as well is a reverse
proxy's job, not this process's.

## Creation modes and their sub-controls

The **Modes** tab edits how the studio writes prompts, without touching code.

A mode has two parts, and they enter the request at different moments:

```
your raw idea ─────────────────────────────┐
                                           ├─► refiner ─► final prompt ─► model
brief ──────────► system instruction ──────┘                   ▲
                                                               │
sub-controls ────► "Creative direction: ..." ──────────────────┘
```

- **The brief never appears in the prompt.** It is the instruction the *refiner*
  receives — the rule for how to rewrite your idea. Write it as a directive
  ("keep one creator, one product, one setting"), not as a scene description.
- **Sub-controls do appear, literally.** Each one contributes `field: value`, and
  the set is appended as `Creative direction: creator: a woman in her 20s;
  setting: a real home setting.` That is why the factory values are in English —
  the model reads them. Only the label is translated. In a mode you write
  yourself, label and value are both your text, in whatever language you use.

### Editing, hiding, restoring

Every mode is editable, **including the seven factory ones** (Freeform, UGC,
Unboxing, Hyper Motion, TV Spot, Product Still, Ad with Headline):

| Action | What happens |
| --- | --- |
| **Edit** a factory mode | your version is layered on top as an override; the original stays in code, untouched |
| **Hide** a factory mode | it leaves the creation bar and moves to *Hidden* in the Modes tab — nothing is deleted |
| **Restore** | undoes both the edit and the hiding, in one click |
| **Delete** a mode you created | actually deletes it |

Everything you change lives in `data/modes.json`. Deleting that file returns the
studio to its factory state, however much you changed.

### How many sub-controls can a mode have?

**No limit.** Unboxing ships with three (`view`, `surface`, `moment`) and UGC
with four, but that is editorial, not a cap: add as many fields as you want to
any mode, factory ones included, each with as many options as you want. Both are
free text.

Two things worth knowing before you add ten:

- Every selected value ends up in the prompt. Fifteen fields produce a
  paragraph of direction that competes with your own idea for the model's
  attention — the factory modes stop at three or four for that reason, not
  because more was impossible.
- A field with no options is dropped on save: a selector that selects nothing
  would just be a dead control on screen.

In the editor each option is **its own line** — type it, press Enter, and the
next empty line is already waiting. Options used to be one comma-separated
field, which quietly made a comma impossible inside a value; `de cima, mãos
abrindo` is a legitimate direction and used to break into two.

## Maintenance

Routine care, in rough order of how often you will need it.

| Task | Command |
| --- | --- |
| Update the install | `git pull && npm install && npm run build`, then restart |
| Is it healthy? | `curl -s localhost:8787/api/health` |
| Is it exposed, and how? | `./scripts/remote.sh status` |
| Discover new provider endpoints | `npm run catalog:sync` |
| Rebuild the model registry | `npm run registry` |
| Rebuild the input manifest | `npm run capabilities` |
| Check the MCP contract | `npm run test:mcp` |
| Run the fast test suite | `npm run test:contracts` |
| Full release check | `npm run test:release` (needs a `FAL_KEY` — see Known issues) |

Need it to survive a reboot? See [Keep it running](#keep-it-running-systemd).

**Where your data lives.** Everything is under `data/`, which is gitignored:
`data/outputs` (generated media, mirrored locally because provider URLs expire),
`data/inputs` (what you attached), `data/previews`, `data/projects` (website and
document builds) and `data/bench.db` (history, spend and capability checks). Back
up that folder and you have backed up the studio; `BENCH_DATA_DIR` moves it
elsewhere, e.g. to a larger disk.

**Disk grows with use.** Generated video is the bulk of it. Deleting files under
`data/outputs` frees space and leaves the ledger entry intact — the row keeps
what it cost and which model made it, and only the local copy is gone.

**The catalog refreshes itself.** The interval is the `auto` selector on the
catalog title line (manual, 1h, 6h, 24h, weekly); `Refresh catalog` next to it
does it now. `server/capabilities.json` is versioned but self-invalidating — when
a model's declared inputs change, it rebuilds on the next boot.

**After updating, if the interface looks stale**, the build is the usual reason:
`dist/` is not versioned, so a pre-built site keeps serving the old bundle until
`npm run build` runs. See *Updating an existing install*.

## Remote access reference (`remote.sh`)

The step-by-step for a networked install is
[Install B](#install-b--vps-reachable-from-outside). This section is the
reference for the script it uses.

```bash
./scripts/remote.sh open                    # publish the interface on this machine's IP
./scripts/remote.sh open --ip 203.0.113.7   # ...but only to that address
./scripts/remote.sh open --firewall         # also enable ufw (SSH allowed first)
./scripts/remote.sh close                   # back to local access only
./scripts/remote.sh status                  # open or closed, and with what protection
```

**What it touches, and nothing else:**

- `.env` — `BENCH_WEB_HOST=0.0.0.0` and `BENCH_API_HOST=127.0.0.1`, written `600`
- `ufw` — `allow OpenSSH` first, then `allow <port>/tcp`
- `data/remote.state` — the port, the previous `BENCH_WEB_HOST`, whether the rule
  was created, any IP restriction, and when

**Decisions inside the script:**

- **`close` reads the state file**, so it undoes what *that* `open` did rather
  than what an `open` usually does.
- **The SSH rule is allowed before any `ufw enable`, and never removed.**
  Deleting it is how people lock themselves out of their own server.
- **Idempotent.** Running it twice breaks nothing.
- **It does not enable the firewall on its own.** If ufw is installed and
  inactive it says so and offers `--firewall`, instead of changing the machine's
  policy for you.
- **It never publishes the API.** Port 8787 stays on loopback.

**A restart is required after `open` and after `close`**, because both write to
`.env` and the process reads the host it binds to at boot. Until you restart, the
file says one thing and the running socket does another — which `status` reports.

> **Updating from a version before 2026-08-18:** `open` could report OPEN, write
> `.env`, add the firewall rule, and the interface would still answer only
> `127.0.0.1`. Vite does not load `.env` into `process.env` while evaluating its
> config, so `vite.config.js` never saw `BENCH_WEB_HOST` — the server read the
> file and the interface did not. It reads `.env` itself now, with the same
> precedence.

The password rules that govern all of this are in [Passwords](#passwords); the
hardening order is in [Leaving it up safely](#leaving-it-up-safely).

## Leaving it up safely

In rough order of what actually protects you:

1. **Set a password, at install time.** On a machine that will be reachable, make
   it part of the setup — `npm install`, then `npm run set-password`, then
   `./scripts/remote.sh open`. Doing it in that order means the studio is never
   open without one, and you never need the password screen you cannot use from
   the network anyway.
2. **Keep the API on loopback.** The default. `BENCH_API_HOST=0.0.0.0` is an
   opt-out you should have a reason for.
3. **Narrow who can reach it.** `./scripts/remote.sh open --ip <your-ip>` beats
   an open port. A Tailscale address beats both, and needs no port at all.
4. **Turn the firewall on.** `./scripts/remote.sh open --firewall` allows SSH
   first, then enables ufw. Also check your VPS provider's own firewall panel —
   it sits in front of ufw and answers to nobody on the machine.
5. **Terminate HTTPS in front.** Point a domain at the machine and put nginx or
   Caddy in front with a Let's Encrypt certificate, proxying `/api`, `/media`,
   `/previews`, `/inputs` and `/projects` to `127.0.0.1:8787` and serving
   `npm run build`'s `dist/` as the site. Then close 5200 entirely. If you do
   this, make the proxy send `X-Forwarded-For`: the machine-only rule below
   depends on it.
6. **Run it as its own user, not root,** under a systemd unit, with `.env` at
   `600` — which is how the studio writes it.
7. **Close it when the test ends.** `./scripts/remote.sh close`. An exposure you
   forgot about is the one that costs you provider credits.

## Documentation

| Document | What it covers |
|---|---|
| [`docs/ABOUT.md`](docs/ABOUT.md) | What the studio is, the reasoning behind each choice, and what it deliberately does not do — everything this README used to carry between the install steps |
| [`docs/COMO-FUNCIONA.md`](docs/COMO-FUNCIONA.md) | How the system works inside: the provider contract, the traps measured per provider, cost classes, availability vs curation, the refine chain, the builder, and the security model |
| [`docs/ACESSO-REMOTO.md`](docs/ACESSO-REMOTO.md) | Acesso remoto e VPS: por que a senha vem antes da porta, o que o `remote.sh` toca, a ordem de endurecimento e o que ficou em aberto |
| [`docs/KIE-MODELOS.md`](docs/KIE-MODELOS.md) | Levantamento do catálogo do kie.ai (169 modelos): ids reais da API, entradas de cada um, quais têm quadro inicial e final, e por que só quatro estão registrados |
| [`docs/HISTORICO.md`](docs/HISTORICO.md) | Everything built on top of the original kit, and every bug found — separating the ones that were already there from the ones introduced along the way |
| [`CHANGELOG.md`](CHANGELOG.md) | Version by version |
| [`.env.example`](.env.example) | All 16 settings, what each unlocks, and where to get the key |
| [`SECURITY.md`](SECURITY.md) | Threat model and reporting |

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local API and web interface. |
| `npm run build` | Build the production web application. |
| `npm run registry` | Rebuild the curated model registry. |
| `npm run capabilities` | Rebuild the capability manifest. |
| `npm run catalog:sync` | Refresh provider discovery and pricing evidence. |
| `npm run mcp` | Start the stdio MCP server. |
| `npm run set-password` | Set or change the studio password (`-- --remove` clears it). |
| `npm run test:contracts` | Run API, persistence, and model-contract tests. |
| `npm run test:mcp` | Smoke-test MCP discovery and media behavior. |
| `npm run test:e2e` | Run browser journeys and accessibility checks (needs `npx playwright install chromium` once). |
| `npm run test:release` | Run the complete release gate. |

## Security and privacy

**Default posture.** Both ports bind to loopback and there is **no password** —
talking to your own machine should not require one. Nothing leaves your machine
except the calls you make to the providers you configured.

**Keys.** Read server-side, never returned to the UI. The Config screen shows
presence, origin and the last 4 characters — never the value. `.env` is written
with owner-only permissions (`600`) and is gitignored.

**Optional password.** Set `BENCH_PASSWORD` and the API requires a session. It
is a scrypt hash, it can only be set from the machine itself, and forgetting it
is recoverable by deleting the line — the full rules are in [Passwords](#passwords).

**Writing settings is machine-only.** Even with a valid session, `POST` to the
config endpoints is refused from the network — changing keys requires being at
the machine. This survives the dev proxy: the API only trusts a forwarded origin
when the socket is already loopback, so a request from the network cannot forge
one.

**Exposing it.** `./scripts/remote.sh open` publishes the interface to your network.
Prefer reaching the studio over Tailscale or behind a password-protected reverse
proxy rather than an open port. Generated media may still be retained by the
provider under that provider's terms, and website builds can invoke a locally
authenticated coding agent — review generated source before deploying it.

Read [SECURITY.md](SECURITY.md) before exposing, modifying, or redistributing
the service.
- Generated media may still be retained by an external provider according to
  that provider's terms.
- Website and document creation can invoke a locally authenticated coding
  agent. Review generated source before deploying it.

Read [SECURITY.md](SECURITY.md) before exposing, modifying, or redistributing
the service.

## Language / Idioma

The interface speaks **Portuguese (pt-BR) and English**. It picks the language
in this order: `?lang=pt-BR` in the URL → the choice stored in this browser →
your browser's language → pt-BR. Use the **PT/EN** button on the right of the
top bar to switch at any time; the choice sticks.

A interface é **bilíngue (pt-BR / en)**, com o português como padrão. Quem chega
com o navegador em outro idioma cai em inglês sozinho. O botão **PT/EN** no
canto direito da barra do topo troca a qualquer momento.

Jargão como *prompt*, *seed*, *upscale*, *engine* e *provider* fica em inglês de
propósito — é o vocabulário que você vai reencontrar em qualquer outra
ferramenta — mas com a explicação disponível ao passar o mouse.

O que **não** muda de idioma: os valores enviados aos modelos. Os submodos de
cena, os enums de parâmetro e o prompt final saem sempre em inglês, que é onde
esses modelos rendem melhor.

Traduções vivem em `src/i18n/pt-BR.js` e `src/i18n/en.js` — nenhuma frase é
escrita dentro do JSX. Para acrescentar um idioma, copie um dos dois arquivos,
registre-o em `src/i18n/index.jsx` e pronto.

## Known issues

Honest state of the test suite at 1.4.2, so you know what you are looking at
when `npm run test:release` is not all green:

| Test | Status |
| --- | --- |
| `an attachment follows compatible models…` (desktop + mobile) | Fails. Pre-dates this fork's i18n work; the model it reaches for is not offered when your catalog differs. |
| `creator visual contract stays stable` (mobile) | Fails. The committed baseline was captured on macOS; a Linux run renders different type. |
| `invalid generation and project requests…` (`tests/api.test.mjs`) | Needs a working `FAL_KEY`; without one the model it probes reports "unavailable" before the case under test. |
| `every workspace has no serious accessibility violations` | Passes with providers reachable. With most models unavailable, the dimmed cards drop below the AA contrast threshold. |

`npm run test:contracts`, `npm run test:mcp` and the remaining 25 end-to-end
tests pass. Fixes welcome.

Three product-side gaps, stated rather than hidden:

- **Seedance 2.5 cannot be quoted.** It bills in "1000 tokens" by a formula fal
  does not publish, so the studio shows the unit price and says the total is
  known only after the run. Guessing a total is how it used to advertise
  $0.0214 for both a 5-second and a 30-second clip.
- **kie.ai ships four models.** Its list is hand-written because kie publishes no
  per-model price API; Veo 3.1, Sora 2, Wan and Suno exist there and are not
  registered here. Adding one is an entry in `kie.models.json` plus a price in
  `PRICE`.
- **The read-only Config screen is half done** — see the table in
  `docs/ACESSO-REMOTO.md`.

## Fork and license

This is a fork of **[promptadvisers/bench-studio-public](https://github.com/promptadvisers/bench-studio-public)** (MIT).
What this fork adds on top of upstream:

- Four extra providers beyond fal — **Agnes AI** (zero cost), **kie.ai**,
  **Kling** (official CLI / OAuth) and **inemaimg** (your own local GPU).
- An optional **studio password** (scrypt hash) and a LAN-exposure warning.
- The **Config** screen: which keys are present, where each came from, and what
  it enables — without ever sending a secret to the browser.
- The **bilingual interface** described above.

The upstream copyright and the [MIT License](LICENSE) are preserved unchanged.
Bugs in this fork are ours, not upstream's — report them here.

---

<div align="center">

**The models do the heavy lifting. Bench makes the layer around them visible—and yours.**

</div>
