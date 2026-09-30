`title [गरुडपुराणम्]

`command-def { name="speaker" category="content" }
`command-def { name="meter" category="metadata" }
`command-def { name="preface" category="content" }
`command-def { name="colophon" category="content" }

`command-def { name="annotate" category="metadata" flexible_args="true" }
`command-def { name="note" category="metadata" flexible_args="true" }

`facets { speaker="वक्ता", meter="छन्दः" }

`set settings {
  break_after = "।॥"
}

`set context {
  work = "Garuḍa Purāṇa",
  corpus = "garuda-purana"
}
