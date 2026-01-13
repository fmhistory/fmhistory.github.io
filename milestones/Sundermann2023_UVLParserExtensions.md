---
id: "Sundermann2023_UVLParserExtensions"
title: "UVL Extensions"
longtitle: "UVLParser: Extending UVL with Language Levels and Conversion Strategies"
description: "This work introduces technical enhancements to the UVL ecosystem by extending the UVLParser with the concepts of language levels and conversion strategies. Language levels allow tools to explicitly define which UVL constructs they support (e.g., Boolean vs. Arithmetic), while conversion strategies provide the logic to automatically transform models between these levels. This enables interoperability between tools with varying degrees of analytical sophistication."
concepts: ["Language Levels", "Conversion Strategies", "UVLParser", "Level-aware parsing", "Tool interoperability"]
hierarchy: ["Variability modeling", "Textual Variability Languages", "UVL"]
parents: ["Sundermann2021_UVL"]
---

### Key Contributions
* **Language Levels**: Formalized the categorization of UVL features into specific tiers of expressiveness, such as Boolean or Arithmetic constraints.
* **Automated Conversion**: Developed strategies to downgrade complex models for simpler tools or upgrade them for more advanced ones, ensuring a wider range of tools can process UVL models.
* **Standardized Parsing**: Provided the reference parser implementation (UVLParser) that serves as the technical backbone for the language's adoption.