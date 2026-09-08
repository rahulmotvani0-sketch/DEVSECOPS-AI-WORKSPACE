# Contribution Terms — DCO (recommended) vs CLA

You want to keep a commercial edition possible later (open-core). That requires being
able to relicense or build proprietary features on top of the code. Once outside
contributors submit code, you can't do that unless you secured the rights **up front**.
There are two standard ways. Pick one **before your first external PR** — retrofitting is painful.

## Option 1 — DCO (recommended for you)

The **Developer Certificate of Origin** is a lightweight sign-off: contributors add a
`Signed-off-by:` line (`git commit -s`) certifying they wrote the code and can license it
under the project's license (Apache-2.0). No paperwork, no bot account, low friction —
the same model the Linux kernel and CNCF projects use.

**Enough for open-core?** Yes, in practice: Apache-2.0 already grants you (and everyone)
broad rights, and you own the **trademark** (the name "Airlock"), which is what actually
protects a commercial edition. DCO + Apache-2.0 + trademark is a clean, contributor-friendly base.

Set up: enable the **[DCO GitHub App](https://github.com/apps/dco)** to require sign-off on PRs.
The PR template already asks for it.

The DCO text: <https://developercertificate.org/>

## Option 2 — CLA (heavier, only if you need copyright assignment)

A **Contributor License Agreement** has contributors grant you explicit rights (sometimes
copyright assignment). Use it only if you later need to relicense the whole project or
offer it under a different license to enterprise customers. It adds friction — contributors
must sign before their first PR — which can deter casual contributors early on.

Set up (if you choose this): **[CLA Assistant](https://github.com/cla-assistant/cla-assistant)**
bots the signing flow on each PR.

## Recommendation

Start with **DCO** now (frictionless, protects the common case). Only move to a CLA if a
future commercial requirement genuinely needs copyright assignment — and by then you'll
have the traction to justify the friction.

Either way: **register the "Airlock" trademark** (or your final name) — under Apache-2.0
the name is the asset you can actually keep commercial.
