---
id: "Batory2005_FMsGrammarsAndPropositionalFormulas"
title: "FMs, Grammars, and Propositional Formulas"
longtitle: "FMs, Grammars, and Propositional Formulas"
description: "Don Batory established a fundamental technical foundation for FMs by formally proving the connection between FMs, grammars, and propositional formulas. This formal equivalence was historically important because it provided a way to leverage mature, efficient tools from the logic and Artificial Intelligence communities to solve FM problems. Specifically, Batory proposed and demonstrated the use of Logic Truth Maintenance Systems (LTMSs) for real-time constraint propagation during product configuration and employed Satisfiability (SAT) solvers for debugging and verifying feature models. This approach established the boolean constraint satisfaction problem as the dominant technical paradigm for automated FM analysis."
concepts: ["Propositional logic mapping", "SAT solvers for FM", "Feature Model Debugging", "Staged configuration", "Grammar-logic equivalence"]
hierarchy: ["Automated Analysis", "Propositional logic based analyses"]
parents: [Czarnecki2005_StagedConfiguration, Benavides2005_AutomatedReasoning, Mannion2002_FirstOrderLogic]
awards: ["🏆SPLC Test-of-Time Award 2017"]
---

### Historical Significance
Before this publication, feature models were primarily treated as graphical diagrams or structured text with limited automated support for complex constraints. Batory's work acted as a bridge between the Software Product Line (SPL) community and the field of Automated Reasoning.

### Key Contributions
* **Automation**: Introduced the idea of using SAT solvers to automatically detect "dead features" (features that can never be part of a valid product) and "common features" (features that must be in every product).
* **Staged Configuration**: Formalized the process of "specializing" a feature model in multiple steps, where each step results in a new, more restricted feature model, eventually leading to a single product.
* **Consistency**: Showed how arbitrary cross-tree constraints (often represented as "requires" or "excludes" in FODA) could be represented as simple propositional clauses (e.g., $A \Rightarrow B$ or $\neg (A \land C)$).

### Relationship to Future Works
This paper is the direct ancestor of the entire **Automated Analysis of Feature Models (AAFM)** subfield. It provided the logical "ground truth" that later researchers—including the Monte Carlo and statistical approaches seen in **Heradio2019** and **Horcas2021**—built upon. While Batory focused on exact logic, the later works expanded these concepts to handle the "colossal spaces" where pure SAT solving might become computationally expensive.