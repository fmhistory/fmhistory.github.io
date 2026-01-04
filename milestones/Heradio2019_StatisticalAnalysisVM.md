---
id: "Heradio2019_StatisticalAnalysisVM"
title: "Statistical Analysis"
longtitle: "Supporting the Statistical Analysis of Variability Models"
description: "This landmark paper establishes a formal probabilistic foundation for the automated analysis of variability models, moving the field beyond traditional binary (yes/no) logic. It introduces two exact and scalable algorithms based on Binary Decision Diagrams (BDDs): Feature Inclusion Probability (FIP), which calculates the likelihood of a feature being included in any valid product, and Product Distribution (PD), which computes the frequency of products based on their size. This work enables the characterization of software product lines through descriptive statistics (mean, variance, homogeneity) and provides a quantitative way to detect nearly-dead features and assess the impact of configuration choices in models with tens of thousands of features."
concepts: ["Feature Inclusion Probability (FIP)", "Product Distribution (PD)"]
hierarchy: ["Automated Analysis", "Statistical and Probabilistic Methods"]
parents: ["Bryant1986_GraphBasedBDD"]
---

### Internal Notes
* **Paradigm Shift**: Before this work, most Automated Analysis of Feature Models (AAFM) focused on Boolean questions (e.g., "Is this model valid?" or "Is this feature dead?"). [cite_start]This paper introduced the ability to ask "How much?" or "How likely?", providing a continuous range of values for analysis[cite: 324, 347].
* [cite_start]**Scalability**: By leveraging BDD technology, the authors demonstrated that exact statistical calculations are feasible even for "colossal" models like the Linux Kernel (KConfig) or industrial automotive models containing over 17,000 features[cite: 327, 359].
* **Dual Support**: The milestone identifies specific benefits for two roles:
    * [cite_start]**Domain Engineers**: Can identify SPL complexity and refactor "highly dispensable" features (those with reusability close to zero)[cite: 345, 348].
    * [cite_start]**Application Engineers**: Receive real-time feedback on how each configuration decision shrinks the remaining search space and impacts the potential size of the final product[cite: 349].
* **Relationship to Horcas 2021/2023**: This paper provides the mathematical "ground truth" (the exact FIP and PD values). The subsequent MCTS and MCS papers build on these concepts but focus on using simulation/heuristics to approximate these values when models are so large that even BDD-based exact methods might struggle with memory or time constraints.