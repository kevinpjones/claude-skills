# Interview Methodology

Detailed protocol for the iterative user interview process during Memory Bank project initialization.

## Interview Principles

- Ask 1-3 questions per round to avoid overwhelming the user
- Prioritize questions that fill the largest knowledge gaps
- Use information from codebase analysis to ask informed, specific questions
- Adapt questions based on previous answers — don't ask about things already covered
- Track progress with a task list so you don't lose track across rounds

## Question Bank by Category

### 1. Project Scope Questions

Start here — these establish the foundation for all other questions.

**Core questions:**
- "What specific features or functionality should be implemented?"
- "Are there existing components that should be modified vs. new ones created?"
- "What are the success criteria for this project?"
- "What is the minimum viable deliverable?"

**Follow-up triggers:**
- If user mentions multiple features → "Which features are highest priority?"
- If user mentions existing code → "Which parts of the existing codebase are most relevant?"
- If scope seems large → "Can we identify a first milestone or phase?"

### 2. Technical Context Questions

Ask these after scope is clear — they shape how to implement.

**Core questions:**
- "Are there specific coding standards or patterns I should follow?"
- "What testing requirements exist for this project?"
- "Are there performance or scalability considerations?"
- "What development environment or tooling should I use?"

**Follow-up triggers:**
- If user mentions testing → "What test frameworks are in use? What coverage is expected?"
- If user mentions performance → "Are there specific benchmarks or SLAs?"
- If user mentions standards → "Is there a linter config or style guide?"

### 3. Integration Questions

Ask these when the project involves external systems or services.

**Core questions:**
- "How should this integrate with existing systems or APIs?"
- "Are there specific deployment or environment considerations?"
- "What dependencies or external services are involved?"
- "Are there authentication or authorization requirements?"

**Follow-up triggers:**
- If user mentions APIs → "Are there API docs or OpenAPI specs available?"
- If user mentions deployment → "What's the deployment pipeline? CI/CD?"
- If user mentions auth → "What auth provider or pattern is used?"

### 4. User Experience Questions

Ask these when the project has user-facing components.

**Core questions:**
- "Who are the target users for this functionality?"
- "Are there specific UI/UX requirements or mockups?"
- "What error handling and edge cases should be considered?"
- "Are there accessibility requirements?"

**Follow-up triggers:**
- If user mentions UI → "Are there design system or component library constraints?"
- If user mentions users → "What's the expected user volume or concurrency?"
- If user mentions errors → "How should errors be surfaced to users?"

## Interview Loop Protocol

```
FOR each question category (in priority order):

  1. PLAN: Select 1-3 most critical questions from the category
     - Skip questions already answered by codebase analysis
     - Skip questions answered in previous rounds
     - Prioritize questions that unlock follow-up insights

  2. ASK: Present questions using AskUserQuestion tool
     - Frame questions clearly and specifically
     - Reference what you already know to show context
     - Allow the user to provide free-form responses

  3. PROCESS: After receiving the response:
     a. Extract new requirements, constraints, and specifications
     b. Identify which memory bank files need updating
     c. Note any follow-up questions triggered by the response

  4. UPDATE: Patch the relevant memory bank files
     - Use memory_bank_patch for targeted updates (not full rewrites)
     - Read with includeLineNumbers=true first to get line numbers
     - Add new sections or append to existing ones

  5. ASSESS: Check if the category is sufficiently covered
     - If gaps remain, loop back to step 1 with follow-up questions
     - If covered, move to the next category

  6. EXIT: The user may request to end the interview at any time
     - Proceed to Context Sufficiency Assessment
     - Document any remaining gaps
```

## Memory Bank Update Process

After EACH user response, update the relevant files:

### What Goes Where

| Information Type | Target File | Section |
|---|---|---|
| Requirements, deliverables | projectbrief.md | Goals, Requirements |
| Problem statement, user needs | productContext.md | Problem, Users |
| Architecture decisions | systemPatterns.md | Architecture, Patterns |
| Tech stack, constraints | techContext.md | Stack, Constraints |
| Current status, next steps | activeContext.md | Current Focus |
| Feature details | featureSpecs.md (create if needed) | Per-feature sections |
| API details | apiContext.md (create if needed) | Endpoints, Auth |
| Test requirements | testingContext.md (create if needed) | Strategy, Coverage |

### Patching Strategy

**Prefer patching over full rewrites:**

1. Read the file with line numbers:
   ```
   mcp__memory_bank__memory_bank_read(projectName, fileName, includeLineNumbers=true)
   ```

2. Identify the section to update (find the right line range)

3. Apply the patch:
   ```
   mcp__memory_bank__memory_bank_patch(projectName, fileName, startLine, endLine, oldContent, newContent)
   ```

**When to use full update instead of patch:**
- The file is still in its initial template state (mostly placeholders)
- The entire file needs restructuring
- The file is very short (under 10 lines)

## Adapting to Project Type

### For Greenfield Projects (no existing code)
- Spend more time on scope and requirements questions
- Skip codebase analysis (Step 4)
- Focus on architecture decisions and tech stack choices

### For Existing Codebases
- Let codebase analysis answer technical questions first
- Focus interview on goals, priorities, and non-obvious context
- Ask about pain points and technical debt

### For Feature Additions
- Focus on how the feature fits into existing architecture
- Ask about affected components and integration points
- Prioritize understanding existing patterns to follow

## When to Stop Interviewing

Stop when you can confidently answer:
1. What is being built and why?
2. How should it be built (architecture, patterns, tech)?
3. What does success look like?
4. What are the key constraints and risks?
5. What should be built first?

If you can answer all five, you have sufficient context to move to the planning phase.
