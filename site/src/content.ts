/**
 * The site copy, in one place.
 *
 * This is the public view of the system: it describes roles and behaviour, not
 * machines. Every claim here is checkable in this repository's `docs/` or in a
 * package's tests, which is the rule for anything published here.
 *
 * The repository's own URL is a build input (`VITE_REPO_URL`) rather than a
 * literal: the public tree never names the account it lives under, and a build
 * without the variable simply renders fewer outbound links.
 */

const REPO = (import.meta.env.VITE_REPO_URL ?? "").replace(/\/+$/, "");
export const UI_REPO = "";

export const repoUrl: string = REPO;

export const site = {
  title: "Imagoro",
  tagline:
    "A holistic workflow system, with one shared blackboard, and one agentic policy matrix governing it"
} as const;

export interface NavItem {
  label: string;
  route: string;
}

export const nav: readonly NavItem[] = [
  { label: "Home", route: "/" },
  { label: "How it works", route: "/services" },
  { label: "Architecture", route: "/insights" },
  { label: "About", route: "/about" },
  { label: "Skills & Tools", route: "/skills" },
  { label: "Terminal", route: "/term" },
  { label: "Contact", route: "/contact" }
];

export type Section =
  | { kind: "hero"; headline: string; sub: string }
  | { kind: "features"; headline?: string; features: readonly { title: string; body: string }[] }
  | { kind: "text"; headline?: string; sub?: string; points?: readonly string[] }
  | { kind: "flow"; headline: string; sub: string; nodes: readonly { name: string; body: string }[] }
  | { kind: "cta"; headline: string; sub: string; links: readonly { label: string; href: string }[] };

export interface Page {
  route: string;
  title: string;
  description: string;
  sections: readonly Section[];
}

const HOME: Page = {
  route: "/",
  title: "Imagoro",
  description:
    "A holistic agentic workflow system: one shared blackboard for the work, one policy matrix for what it may touch",
  sections: [
    {
      kind: "hero",
      headline: "Agents do the work. Policy decides what they may touch.",
      sub:
        "Imagoro hosts agentic work end to end. Agents, tools and people act on one shared blackboard, and a single " +
        "policy matrix is generated straight into the database rules — so every read and write, by anyone, is decided " +
        "in one place. This site is a public view of that system, not a mockup of it."
    },
    {
      kind: "features",
      features: [
        {
          title: "One blackboard",
          body:
            "Shared, typed state that agents write, the console edits and every other surface reads. There is one " +
            "version of a run, not a per-agent copy of it."
        },
        {
          title: "One policy matrix",
          body:
            "Every read, write and audit decision derives from a single matrix. The database rules are generated from " +
            "it, never hand-edited, so the client and the server cannot drift apart."
        },
        {
          title: "Agents that leave a receipt",
          body:
            "Kao is an MCP harness, not a script runner. A publish is a validated, hashed, enveloped transaction, so " +
            "what an agent changed is verifiable after the fact."
        }
      ]
    },
    {
      kind: "cta",
      headline: "See the loop, then try the terminal",
      sub:
        "The same build serves the pages and the browser terminal. The terminal defaults to an in-browser demo shell " +
        "and points at a real pty agent when one is configured.",
      links: [
        { label: "How it works", href: "/services" },
        { label: "Open the terminal", href: "/term" }
      ]
    }
  ]
};

const SERVICES: Page = {
  route: "/services",
  title: "How it works",
  description: "The parts an agentic workflow runs on",
  sections: [
    {
      kind: "features",
      headline: "One loop, three parts",
      features: [
        {
          title: "The harness is where agents act",
          body:
            "Imagoro Kao exposes the system over MCP. Tools read, write and publish against the blackboard, and " +
            "nothing reaches the database outside that surface."
        },
        {
          title: "The blackboard is where the work is",
          body:
            "Shared, typed state that agents write, the console edits and every other surface reads, so there is one " +
            "version of a run rather than a per-agent copy of it."
        },
        {
          title: "The policy is what makes it safe to open",
          body:
            "One matrix becomes both the row-level rules and the harness's own capability checks — the same decision, " +
            "enforced in two places that are proven equal."
        }
      ]
    },
    {
      kind: "text",
      headline: "Where each part runs",
      sub:
        "Three small machines on one private mesh. Inference engines listen only on loopback and are reached through " +
        "keyed gates; the blackboards are mesh-only. Each part stays on the tier that can carry it.",
      points: [
        "The hub — the blackboards, the hazard sources, the map and routing backend, the small nav specialists, and the web edge.",
        "The agent box — the harness and its agents, the security crew, and the collectors.",
        "The workstation — heavy inference, and the operator consoles."
      ]
    },
    {
      kind: "text",
      headline: "What this repository is",
      sub:
        "This is the public portfolio. It holds working, tested code for the pieces that stand alone, plus write-ups " +
        "of the whole system. The harness source and the deployment are described rather than published.",
      points: [
        "The serving gates, the security-suite core, the hazard-source library and the UI core, each with its tests.",
        "Write-ups by role: the hub, the agent box, the workstation, the mesh.",
        "A running log of what changed and why."
      ]
    }
  ]
};

const INSIGHTS: Page = {
  route: "/insights",
  title: "Architecture",
  description: "One policy matrix, one blackboard, one chokepoint between them",
  sections: [
    {
      kind: "flow",
      headline: "The path a request takes",
      sub:
        "A block never calls the harness directly. Everything crosses one gateway, so auth, timeouts and error shaping " +
        "live in a single place.",
      nodes: [
        {
          name: "Client",
          body: "A composable block GUI and a node canvas, built on one block contract."
        },
        {
          name: "Gateway",
          body: "The one network chokepoint. Transport only; policy lives in the broker."
        },
        {
          name: "Harness",
          body: "Kao exposes the system over MCP. Nothing reaches the database outside it."
        },
        {
          name: "Blackboard",
          body: "Typed shared state, with row-level ACLs generated from the matrix."
        }
      ]
    },
    {
      kind: "features",
      headline: "The client-side safety model",
      features: [
        {
          title: "The broker is where policy runs",
          body:
            "Confirmed intents and quick-run tool pills reach the gateway only through the broker. Before a request " +
            "leaves the tab it checks the tool, the caller's role, the argument shapes, a rate window and an in-flight cap."
        },
        {
          title: "Dry runs never dispatch",
          body:
            "Proposals are simulated. Writes and system controls need the operator's explicit confirmation, and the " +
            "gateway stays transport-only."
        },
        {
          title: "Guard at every boundary",
          body:
            "Strings crossing a UI, log or JSON boundary are collapsed to one line, with control and bidi characters " +
            "stripped before anything renders."
        }
      ]
    },
    {
      kind: "text",
      headline: "Six principles the system is built on",
      points: [
        "Fail closed. Unknown role, engine, model, content shape or config is refused, not defaulted.",
        "Agents don't act. Models have no tools; runners read and write the blackboard, and only a guarded executor changes a host, after a human approves.",
        "Least visibility. Tokens are scoped per role, and dashboards use an observer role that never sees raw events.",
        "Treat text as hostile. Anything from a log, a feed or a user is screened before a model reads it and escaped before a human does.",
        "Determinism where it matters. Contract roles run at temperature 0 and answer in fixed formats, so a parser decides what happens next.",
        "One lineage. Qwen3, Apache-2.0, everywhere, so a role behaves the same on any machine that serves it."
      ]
    },
    {
      kind: "cta",
      headline: "Read the write-ups",
      sub: "The architecture and UI pages carry the details, including the parts that are described rather than published.",
      links: REPO
        ? [
            { label: "Architecture", href: `${REPO}/blob/main/docs/architecture.md` },
            { label: "UI ecosystem", href: `${REPO}/blob/main/docs/ui.md` }
          ]
        : [{ label: "How it works", href: "/services" }]
    }
  ]
};

const ABOUT: Page = {
  route: "/about",
  title: "About",
  description: "The workflow and the policy are one design, not two layers",
  sections: [
    {
      kind: "text",
      headline: "What the system actually is",
      sub:
        "Most agent tooling hands the model capability and bolts governance on somewhere behind it. Here the governance " +
        "is the substrate: the same matrix that grants a read is what generates the rule that permits the row, so an " +
        "agent's capability is exactly the capability the policy already decided — and nothing widens by accident.",
      points: [
        "The client — a composable block GUI and a node canvas, with twelve block families on one manifest contract.",
        "The harness — Imagoro Kao, the MCP/agentic harness. Its first rendition wraps the Scout CLI.",
        "The blackboard — the Postgres store behind all of it, with row-level ACLs generated from that one matrix.",
        "Auth — boot-time sign-in wiring: TOTP, plus FIDO2 physical keys.",
        "Artifacts — a signed catalog with profiles and OTA, so a published artifact carries its own provenance.",
        "Gates — the milestone suites. The client, harness and server tests all have to pass."
      ]
    },
    {
      kind: "features",
      headline: "Where the trust boundaries sit",
      features: [
        {
          title: "One matrix, no second source of truth",
          body:
            "Every read, write and audit decision derives from a single policy matrix. The database rules are generated " +
            "from it, never hand-edited, and a drift between the server and the harness is a failed gate rather than a " +
            "runtime surprise."
        },
        {
          title: "Fail closed, not open",
          body:
            "Category and kind pairs the matrix does not bind are denied with the same structured error on all three " +
            "code paths. Reads are public, writes are staff-only, and audit access never widens alongside them."
        },
        {
          title: "An agentic surface that leaves a receipt",
          body:
            "Kao is an MCP harness, not a script runner. A publish is a validated, hashed, enveloped transaction, so " +
            "what an agent changed is verifiable after the fact and not merely asserted."
        }
      ]
    },
    {
      kind: "text",
      headline: "Licensing",
      sub: "Apache-2.0 at the source root, with a NOTICE carrying attributions for mirrored and upstream material.",
      points: [
        "The repo family is referenced as dependencies rather than vendored into the tree.",
        "The UI core is mirrored in for a self-contained workspace; the NOTICE records that origin."
      ]
    }
  ]
};

const CONTACT: Page = {
  route: "/contact",
  title: "Contact",
  description: "Source, issues, and where to verify the claims above",
  sections: [
    {
      kind: "cta",
      headline: "Read the source",
      sub:
        "Every claim on this site is checkable in the source. Issues are open, and the test suites are what keep it " +
        "honest.",
      links: [
        ...(REPO
          ? [
              { label: "This repository", href: REPO },
              { label: "Open an issue", href: `${REPO}/issues` }
            ]
          : []),
        { label: "Upstream UI framework", href: UI_REPO }
      ]
    }
  ]
};

export const pages: readonly Page[] = [HOME, SERVICES, INSIGHTS, ABOUT, CONTACT];

export function findPage(route: string): Page | undefined {
  return pages.find((page) => page.route === route);
}
