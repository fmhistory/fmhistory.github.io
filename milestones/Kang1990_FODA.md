---
id: "Kang1990_FODA"
title: "FODA"
longtitle: "Feature-Oriented Domain Analysis (FODA)"
description: "Feature modeling was originally proposed as part of the Feature-Oriented Domain Analysis (FODA) method. Historically, FODA builds on, among others, Neighbors's work on Draco, and Batory's domain analysis of DBMS and the Genesis tool."
concepts: ["Feature", "Feature model", "Feature diagram"]
hierarchy: ["Fundamentals", "Feature model's origins"]
parents: [Neighbors1984_Draco, Batory1988_GENESIS, Moore1989_KAPTUR, Biggerstaff1989_ROSE]
---

# Feature
A prominent or distinctive user-visible aspect, quality, or characteristic of a software system or systems.

Features are the attributes of a system that directly affect end-users. The end-users have to make decisions regarding the availability of features in the system, and they have to understand the meaning of the features in order to use the system. 

# Feature model, Feature diagram
A feature model represents the standard features of a family of systems in the domain and relationships between them. The structural relationship consists of, which represents a logical grouping of features, is of interest. Alternative or optional features of each grouping must be indicated in the feature model. Each feature must be named distinctively and the definition should be included in the domain terminology dictionary. 

Alternative features can be thought of as specializations of a more general category. The term "alternative features" is used (rather than "specialization features") to indicate that no more than one specialization can be made for a system. However, the attributes of (i.e., the description made for) a general feature are inherited by all its specializations

Composition rules define the semantics existing between features that are not expressed in the feature diagram. All optional and alternative features that cannot be selected when the named feature is selected must be stated using the "mutually exclusive with" statement. All optional and alternative features that must be selected when the named feature is selected must be defined using the "requires" statement.

Selection of optional or alternative features is not made arbitrarily. It is usually made based on a number of objectives or concerns that the end-user (and customer) has. 

One of the fundamental trade-offs a system architect makes is deciding when to "biihd" or fix the value of a feature, as this will have an impact on the final architecture. For the purpose of generalization and parameterization of the software architecture, alternative and optional features are grouped into t"hree classes based on when the binding of those features (i.e., instantiation of software) is done:

- Compile-time features: features that result in different packaging of the software and, therefore, should be processed at compile-time. Examples of this class of features are those that result in different applications (of the same family), or those that are not expected to change once decided. It is better to process this class of features at compile- time for efficiency reasons (time and space).
- Load-time features: features that are selected or defined at the beginning of execution but remain stable during the execution. Examples of this class of features are the features related to the operating environment (e.g., terminal types), and mission parameters of weapon systems. Software is generalized (e.g., table-driven software) for these features, and instantiation is done by providing values at the start of each execution.
- Runtime features: features that can be changed interactively or automatically during execution. Menu-driven software is an example of implementing runtime features.

Documentation of a feature model includes: a structure diagram showing a hierarchical decomposition of features indicating optional and alternative features, definition of features, and composition rules of the features.
