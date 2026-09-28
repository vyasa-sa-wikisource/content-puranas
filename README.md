# content-puranas

Mahāpurāṇa workspaces for Sanskrit Wikisource. Crawl and extract live here. The publisher hub packs them and attaches `.vyview` files to GitHub Releases.

The slice `data/wikisource-works.toml` lists the nine titles accepted from the 2026-09-27 probe, in ingest order. Bhāgavata is first.

```bash
bun run crawl:bhagavata
bun run transform:bhagavata
```

That writes Bhāgavata adhyāya wikitext under `data/raw/`. Content repos commit those crawl snapshots so a later Wikisource refresh is a diff against the previous snapshot. From the [`publisher`](https://github.com/vyasa-sa-wikisource/publisher) clone, list this slice with `bun run work list --root ../content-puranas`.
