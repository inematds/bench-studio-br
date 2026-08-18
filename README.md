<div align="center">

# Bench Studio

### Stop renting the wrapper. Own the creative layer.

A local-first creative studio for images, videos, websites, designed PDFs, and AI-agent workflows.

[![MIT License](https://img.shields.io/badge/license-MIT-6D7CFF.svg)](LICENSE)
![Node 22.5+](https://img.shields.io/badge/node-22.5%2B-171A21.svg)
![73 model routes](https://img.shields.io/badge/model_routes-73-6D7CFF.svg)
![5 providers](https://img.shields.io/badge/providers-5-6D7CFF.svg)
![MCP ready](https://img.shields.io/badge/MCP-ready-171A21.svg)

**[Quick start](#run-it-in-three-minutes)** · **[Update](#updating-an-existing-install)** · **[Remote access](#reaching-it-from-another-machine)** · **[Tips](#tips-that-save-you-time-and-money)** · **[How it works in depth](docs/COMO-FUNCIONA.md)** · **[What changed and why](docs/HISTORICO.md)** · **[Security](#security-and-privacy)**

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

## Why this exists

Most creative AI products combine five useful pieces—model access, prompt
polish, routing, storage, and billing—then hide the seams behind a monthly plan.
Bench keeps the convenience while making every seam inspectable.

| Instead of… | Bench gives you… |
| --- | --- |
| One provider's model roadmap | A curated registry you can add to or replace |
| A generic upload box | Controls derived from each endpoint's accepted inputs |
| An invisible prompt rewrite | An editable model-specific draft before submission |
| Abstract credits | A preflight estimate and recorded spend metadata |
| Outputs trapped in an account gallery | Local mirrored files and durable metadata |
| A UI-only workflow | The same capabilities through the UI and MCP |
| Waiting for the next feature | Source you can inspect, change, and extend |

Bench does **not** own the underlying models. It gives you ownership of the
portable layer that connects your ideas, tools, providers, files, and costs.

## Run it in three minutes

### What you need

**Required**

- Node.js **22.5+**; Node 24 recommended, because Bench uses `node:sqlite`.
- npm.

**That is the whole list.** Every provider is optional and degrades on its own:
a missing key makes those models show as unavailable, with the reason and how to
fix it — the studio still starts. Bring at least one of these to generate
anything:

| Provider | Models | Cost | What you need |
|---|---|---|---|
| [fal.ai](https://fal.ai/dashboard/keys) | 37 | dollars, live pricing | `FAL_KEY` |
| [Kling](https://klingai.com) | 26 | plan credits | `npm i -g @klingai/cli-global && kling login` |
| [Agnes AI](https://apihub.agnes-ai.com) | 4 | zero | `AGNES_API_KEY` |
| [kie.ai](https://kie.ai/api-key) | 4 | credits | `KIE_API_KEY` |
| [inemaimg](https://github.com/inematds/inemaimg) | 2 | zero (your GPU) | a running local server |

**Optional, but worth it**

- A [Google AI Studio](https://aistudio.google.com/apikey) or
  [OpenRouter](https://openrouter.ai/keys) key for prompt refinement. Without
  any refiner your prompt is sent raw — which Agnes rejects, because it requires
  English.
- Google Chrome, for PDF printing and visual preflight.
- A signed-in Codex or Claude Code, for agent-driven website and document builds.

### 1. Clone and install

```bash
git clone https://github.com/inematds/bench-studio-br.git
cd bench-studio-br
npm install
```

### 2. Add server-side credentials

```bash
cp .env.example .env
```

Fill in whatever you have. `.env.example` documents all 16 variables — what each
one unlocks, how it bills, and where to create the key. Keys stay server-side and
are never sent to the browser; `.env` is gitignored and written with owner-only
permissions.

Reading order, highest first:

```
exported in your shell  >  .env in the project  >  ~/.env
```

**Or skip the file entirely:** start the studio and use the **Config** button in
the top right. It shows every setting — present or missing, where the value came
from, and the last 4 characters — lets you test each provider, and writes `.env`
for you. For safety it only accepts writes from the machine running the studio.

### 3. Start the studio

```bash
npm run dev
```

Open **[http://localhost:5200](http://localhost:5200)**.

| Service | Address |
| --- | --- |
| Studio | `http://localhost:5200` |
| Local API | `http://localhost:8787` |
| Health and capability summary | `http://localhost:8787/api/health` |

If either port is occupied:

```bash
PORT=8790 BENCH_API_PORT=8790 BENCH_WEB_PORT=5201 npm run dev
```

## Updating an existing install

No dependency changed in recent releases, so `npm install` is usually not
needed — but the server reads everything at boot, so a restart is not optional.

```bash
cd bench-studio-br
git pull
sudo systemctl restart bench-studio   # or kill the process and `npm run dev` again
```

**If you serve the built site instead of `npm run dev`**, `dist/` is not
versioned — the pull brings no new interface until you rebuild:

```bash
npm run build
```

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

## Reaching it from another machine

Both ports bind to loopback, so a fresh install answers nobody but you. Opening
that up means three things — the interface listening on every interface, a
firewall rule, and remembering to undo both. One command does all three:

```bash
./scripts/remote.sh open      # publish the interface on this machine's IP
./scripts/remote.sh status    # open or closed, and with what protection
./scripts/remote.sh close     # back to local access only
```

`open` prints the address to hand out, then tells you to restart with
`npm run dev`. `close` reverses exactly what `open` did — reading a state file
written at open time, not guessing — and leaves the SSH rule alone, because
deleting that is how people lock themselves out of their own server.

Two flags worth knowing:

```bash
./scripts/remote.sh open --ip 203.0.113.7   # only that address, not the internet
./scripts/remote.sh open --firewall         # also enable ufw (SSH allowed first)
```

**`open` offers to set a password before it opens anything.** Say yes and it
hands over to `npm run set-password`; press Enter — or answer `n` — and the
studio opens without one, which is the documented default. The offer is there
because of the asymmetry below: this is the last moment where setting a password
is one keystroke away.

**The password cannot be set or changed from the other machine — not even after
you log in.** `POST /api/config/password` answers 403 to anything that did not
come from loopback, session or no session, and the Config screen says so instead
of showing you a dead field. That rule is what stops whoever finds an open port
from setting a password of their own and locking you out of your own studio. So:

```bash
npm run set-password    # on the machine running the studio, over SSH or at the keyboard
```

What `open` deliberately does **not** do: publish the API. Port 8787 stays on
loopback (`BENCH_API_HOST`), so the endpoint that writes files and spends money
is reachable only through the interface, on the machine itself.

This is a test posture, not a deployment. The traffic is plain HTTP and readable
in transit. For anything that stays up, read the next section.

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

## Tips that save you time and money

**Start with the free routes.** Agnes (4 models) and inemaimg (2, on your own
GPU) cost nothing. In the Model catalog, the **No cost** switch turns exactly
that group on. Use them to find the prompt that works, then spend on the model
that renders it best.

**Curate the catalog once.** 73 models is a lot to scroll. Filter by provider,
then use "Disable those N" to hide what you will not use. Curation is a
preference, not a block: it hides models from the pickers but a **Redo** of an
old result still works. Deleting `data/catalog-prefs.json` restores the factory
state.

**Refine before you spend.** The refined prompt is editable before submission.
Read it. It is the cheapest place to catch a misunderstanding — after you submit,
the fix costs another run.

**Keep two refiners configured.** The chain is Gemini → OpenRouter → local Codex.
With a single one, an exhausted quota takes the whole studio down: the prompt
goes through raw, and Agnes rejects non-English with an error that looks like an
Agnes problem but is not.

**Redo instead of retyping.** Every result carries the model, controls, refined
prompt, original idea and attachments. Redo restores all of it, so you can tweak
one thing without paying for a rewrite.

**The same model can exist on two routes.** Veo, Nano Banana, gpt-image and
gemini-image appear via more than one provider — with different bills (dollars on
fal, plan credits on Kling). The provider is shown next to the name in the
picker; it is a real choice, not a duplicate.

**Kling never auto-retries, on purpose.** Every Kling job is charged, including
failures. Nothing is resubmitted behind your back.

**Watch disk, not CPU.** Every file is mirrored locally because provider URLs
expire — 24h on Kling, temporary on Agnes. Roughly 1.3 MB per image and 0.7–5 MB
per video. The studio idles at 274 MB of RAM.

**Building a website? Prefer an agent.** Codex and Claude Code write the files
themselves and fix their own mistakes. The model engines (local Qwen, OpenRouter)
only return text, so they need no sandbox and cost nothing — but they need more
supervision.

**Point the builder at a reference you own.** Set a site or PDF of yours in
Config and the builder calibrates its finish against it — tokens, fonts, palette,
radii. It never copies brand, copy, structure or files.

## What you can make

| Workspace | What it delivers |
| --- | --- |
| **Create** | Images and videos with model-aware references, controls, editable prompt drafts, quotes, progress, and inline results. |
| **Model catalog** | Curated text-to-image, image-editing, text-to-video, image-to-video, and reference-video routes. |
| **Results** | A local archive containing the submitted prompt, model, provider URL, local file, and recorded cost. |
| **Websites** | Original static sites with editable source, a local preview, and a downloadable bundle. |
| **Documents** | Designed PDFs backed by editable HTML, Chromium printing, and overflow preflight. |
| **Connect** | Machine-correct MCP configuration and a portable skill for compatible agents. |

![Bench Studio create workspace](docs/bench-studio-create.png)

## The system in 30 seconds

```mermaid
flowchart LR
    Idea["Your idea"] --> Client{"How do you want to work?"}
    Client -->|Create manually| UI["React studio"]
    Client -->|Delegate to an agent| MCP["MCP server"]

    UI --> API["Local API"]
    MCP --> API

    API --> Prompt["Editable prompt refinement"]
    API --> Router["Capability-aware router"]
    API --> Quote["Quote and pricing engine"]

    Prompt --> Router
    Router --> Prov["fal · Kling · Agnes · kie · inemaimg"]
    Prov --> Mirror["Local media mirror"]

    API --> Projects["Website and PDF runner"]
    Projects --> Archive["Inspectable project source"]

    Quote --> Ledger[("Local SQLite ledger")]
    Mirror --> Ledger
    Archive --> Ledger
```

The browser never receives provider secrets. It talks to a local service that
validates model-specific payloads, owns credentials, streams progress, mirrors
artifacts, and records durable metadata.

## Choose the right connection strategy

Bench uses an aggregator because one authentication and queue model is the
practical way to support a large, interchangeable catalog. That is not the
only valid architecture.

```mermaid
flowchart TB
    Need{"What do you actually need?"}
    Need -->|One stable model| Direct["Use its first-party API"]
    Need -->|Many interchangeable models| Bench["Use Bench + an aggregator"]

    Direct --> D1["Potentially lowest route price"]
    Direct --> D2["One integration per provider"]
    Direct --> D3["Best for a narrow workflow"]

    Bench --> B1["One authentication and queue model"]
    Bench --> B2["Consistent controls and records"]
    Bench --> B3["Best for a flexible studio"]
```

An aggregator may not always be the cheapest route. Bench makes that tradeoff
explicit instead of calling it “zero markup.”

## One request, from idea to receipt

```mermaid
sequenceDiagram
    participant U as User or agent
    participant B as Bench
    participant R as Capability router
    participant F as fal.ai
    participant L as Local archive

    U->>B: Describe the result
    B->>R: Select a model and inspect accepted inputs
    R-->>B: Controls, limits, and pricing unit
    B-->>U: Editable prompt and preflight estimate
    U->>B: Approve generation
    B->>F: Validated model-specific payload
    F-->>B: Queue progress and output URL
    B->>L: Mirror media and write metadata
    B-->>U: Local result, provider result, and recorded cost
```

Bench records what was submitted. It never claims an attached reference
influenced an output merely because an API accepted the field; creative
fidelity still requires human review.

## Model intelligence, not a dropdown full of URLs

Every endpoint has different assumptions. Some accept one image, some accept a
list, some require a start frame, and others accept no references. Bench keeps
discovery separate from production admission:

```mermaid
flowchart LR
    Catalog["Live provider catalog"] --> Discover["Discovery snapshot"]
    Discover --> Evidence["Schema and pricing evidence"]
    Evidence --> Review{"Safe for production?"}
    Review -->|Not yet| Observe["Keep observable"]
    Review -->|Yes| Registry["Curated registry"]
    Registry --> UI["Relevant UI controls"]
    Registry --> MCP["Validated MCP inputs"]
```

This prevents a newly published, renamed, or underspecified model from silently
breaking a paid workflow.

## Prompt refinement stays visible

1. Write a normal creative request.
2. Bench adds the structure the selected model is likely to understand.
3. Review the rewritten prompt as an editable draft.
4. Change or reject it before spending anything.
5. Store the final submitted prompt with the result.

If no Google key is configured, the original prompt passes through unchanged
and the interface reports that refinement is disabled.

## Cost transparency without marketing math

Before submission, Bench estimates cost from the model's pricing unit and the
requested parameters. After completion, it records the billed amount when the
provider exposes sufficient receipt data.

```mermaid
flowchart LR
    Params["Model + duration + resolution + quantity"] --> Estimate["Preflight estimate"]
    Estimate --> Approval["Explicit approval"]
    Approval --> Run["Provider execution"]
    Run --> Record["Recorded cost + confidence"]
```

Pricing changes. Estimates are not guarantees. Bench distinguishes estimated,
metered, and recorded values instead of presenting all three as the same fact.

## Your local data boundary

The repository starts with no `data/` directory. Bench creates it on first run:

```text
data/
├── bench.db              # generations, assets, spend, and projects
├── inputs/               # mirrored uploads
├── outputs/              # mirrored generations
├── previews/             # local video posters
└── projects/             # website and document source files
```

The entire directory is ignored by Git. Deleting a result removes its local
database record and mirrored files. It does not claim to delete copies retained
by an external model provider.

```mermaid
flowchart LR
    Browser["Browser UI\nno provider keys"] --> Local["Loopback API\nkeys + validation"]
    Agent["Local MCP client"] --> Local
    Local --> Provider["External model provider"]
    Local --> Disk["Local SQLite + files"]
```

## Use it from Claude, Codex, or Cursor

Start Bench, open **Connect**, choose your client, and copy the generated
configuration. Bench inserts the correct absolute path for the current machine;
the repository itself ships with no user's home directory.

The MCP server exposes eleven focused tools for:

- discovering models and inspecting capability contracts;
- uploading local reference media;
- generating images and videos;
- reading results, previews, and spend;
- creating and polling website or document projects;
- retrieving local project artifacts.

The bundled skill in `integrations/skills/bench-studio/` provides judgment and
workflow guidance. MCP provides the live execution layer.

## Project map

```text
bench-studio-public/
├── src/                     # React interface
├── server/
│   ├── server.mjs           # loopback API and orchestration
│   ├── mcp.mjs              # stdio MCP server
│   ├── registry.json        # curated production roster
│   ├── capabilities.json    # accepted-input contracts
│   ├── profiles/            # prompt and pricing intelligence
│   └── mcp-app/             # embedded MCP interface
├── integrations/
│   ├── skills/bench-studio/ # portable agent workflow skill
│   └── macos/               # optional launch-agent templates
├── tests/                   # contracts, persistence, API, a11y, and E2E
├── docs/                    # public README media
├── .env.example             # placeholders only
└── package.json
```

## Documentation

| Document | What it covers |
|---|---|
| [`docs/COMO-FUNCIONA.md`](docs/COMO-FUNCIONA.md) | How the system works inside: the provider contract, the traps measured per provider, cost classes, availability vs curation, the refine chain, the builder, and the security model |
| [`docs/ACESSO-REMOTO.md`](docs/ACESSO-REMOTO.md) | Acesso remoto e VPS: por que a senha vem antes da porta, o que o `remote.sh` toca, a ordem de endurecimento e o que ficou em aberto |
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

**Optional password.** Set `BENCH_PASSWORD` and the API requires a session:

```bash
npm run set-password              # asks for it, without echoing
npm run set-password -- --remove
```

Stored as a scrypt hash, so nobody reads your password out of the file. Setting
or changing it signs everyone else out immediately. Forgot it? Delete the line
from `.env` and restart — that is the recovery path, on purpose, because whoever
has that file already has the keys inside it.

The password protects the API and your generated files. The interface shell is
still served to anyone who reaches the port, but without a session it shows
nothing. Hiding the shell too is a reverse proxy's job, not this process's.

**Writing settings is machine-only.** Even with a valid session, `POST` to the
config endpoints is refused from the network — changing keys requires being at
the machine. This survives the dev proxy: the API only trusts a forwarded origin
when the socket is already loopback, so a request from the network cannot forge
one.

**Exposing it.** `./dev.sh --lan` publishes the interface to your local network.
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

## Honest boundaries

- Bench is a local, single-user tool—not a hosted multi-tenant SaaS product.
- The registry is curated intentionally; catalog presence does not guarantee
  production admission.
- Accepted inputs do not guarantee creative fidelity.
- Website output is static by design.
- PDF creation depends on a local Chrome installation.
- Model availability and pricing can change after a catalog sync.
- Owning the layer means maintaining a small piece of software.

## Release confidence

The release gate covers production builds, API and database contracts, MCP
discovery, browser journeys, accessibility, responsive containment, failure
states, model transitions, and visual snapshots.

```bash
npm run test:release
```

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
