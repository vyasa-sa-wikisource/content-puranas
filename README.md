# content-puranas

Mahāpurāṇa workspaces for Sanskrit Wikisource. Crawl and extract live here. The publisher hub packs them and attaches `.vyview` files to GitHub Releases.

The slice `data/wikisource-works.toml` lists the nine titles accepted from the 2026-09-27 probe, in ingest order. Bhāgavata is first. Mārkaṇḍeya is chapters 1–134 in bundle pages. Brahma is one page per adhyāya. Viṣṇu is one page per adhyāya under six aṃśas. Agni is one page per adhyāya. Garuḍa is one page per adhyāya under three kāṇḍas.

```bash
bun run crawl:bhagavata
bun run transform:bhagavata
bun run crawl:markandeya
bun run transform:markandeya
bun run crawl:brahma
bun run transform:brahma
bun run crawl:vishnu
bun run transform:vishnu
bun run crawl:agni
bun run transform:agni
bun run crawl:garuda
bun run transform:garuda
```

That writes Bhāgavata adhyāya wikitext under `data/raw/`. Content repos commit those crawl snapshots so a later Wikisource refresh is a diff against the previous snapshot. From the [`publisher`](https://github.com/vyasa-sa-wikisource/publisher) clone, list this slice with `bun run work list --root ../content-puranas`.
