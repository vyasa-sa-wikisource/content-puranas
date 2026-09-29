`layout [
{{ body }}
]

`item [
`div { class="verse-content" } [
    `div { class="verse-meta" } [
        `span { class="meta-item" } [
            `span { class="meta-label" } [श्लोकः]
            `span { class="meta-value" } [ {{ amsa }}.{{ adhyaya }}.{{ verse }} ]
        ]
    ]
    `div { class="verse-stack" } [
        `div { class="stream-group" } [
            `div { class="label" } [मूलम्]
            `div { class="deva-text stream-content" } [`stream { ref="primary" }]
        ]
    ]
]
]
