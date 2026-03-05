/**
 * Build the prompt for the generate phase (Opus explores the app).
 */
export function buildGeneratePrompt(config) {
  return `You are a senior QA engineer tasked with creating comprehensive test plans for "${config.name}".

## Application
- **Name**: ${config.name}
- **URL**: ${config.url}
- **Description**: ${config.description || 'N/A'}
- **Test account**: ${config.auth.email}

## Your Task — Incremental Explore-Then-Write

You will explore the app and write test plans **one section at a time**, writing findings to disk immediately so nothing is lost to context compaction or crashes.

---

### Stage 1: Initial Scan & Setup

1. Navigate to ${config.url} and log in with the test account
2. Map ALL sections from the sidebar/navigation — collect **names and URLs only** (do NOT deep-dive yet)
3. Query the database schema via the database MCP tool (tables, columns, enums, relationships)
4. **Write CLAUDE.md immediately** in the current directory with:
   - Application overview and structure
   - Complete navigation map (section name → URL path → one-line description)
   - Database schema documentation (tables, key columns, enums, relationships)
   - Test account details and key entity IDs
   - Naming conventions and patterns observed
   - Testing workflow instructions for executing test plans
   - Production safety rules
   - **A progress checklist** at the bottom, like:
     \`\`\`
     ## Test Plan Progress
     - [ ] 01 - Auth & Onboarding
     - [ ] 02 - Dashboard
     - [ ] 03 - Patients
     ... (one entry per section you identified)
     \`\`\`
   The checklist numbers define the test plan file numbering.

---

### Stage 2: Industry Research

Now that you understand the app, research what leading companies in this space prioritize in testing.
**Timebox this stage to 3-5 searches total, then move on regardless of results.**

1. Based on Stage 1, state the app's category in one line (e.g. "studio management SaaS", "e-commerce platform", "healthcare booking") — write this to CLAUDE.md immediately as the start of the Industry Best Practices section
2. Run targeted searches using these patterns (substituting the actual category/competitors):
   - \`"[category] top software companies"\`
   - \`"[competitor name] features"\`
   - \`"[category] common bugs edge cases"\`
   - \`"[category] QA testing checklist"\`
3. As you find useful findings, **append them to CLAUDE.md incrementally** — do not hold findings only in context
4. Identify 2-3 benchmark companies and note:
   - Features/flows they're known for getting right
   - Edge cases or failure modes common in that industry (e.g. timezone handling, concurrency, payment edge cases, data export, accessibility)
5. If search results are sparse or the app is too niche, note that and proceed — do not block on this stage
6. Ensure the **Industry Best Practices** section in CLAUDE.md is complete and placed *before* the Test Plan Progress checklist, containing:
   - App category
   - 2-3 benchmark companies
   - Key test categories leading companies in this space prioritize
   - Industry-specific edge cases and failure modes

Use these findings in Stage 3 — when writing each section's test cases, add scenarios inspired by the Industry Best Practices in CLAUDE.md.

---

### Stage 3: Per-Section Loop

For **each section** in the progress checklist, in order:

1. **Explore** that section thoroughly:
   - Click every button, link, tab, dropdown, modal, and form
   - Test with both valid and invalid inputs
   - Note URL patterns, validation behaviors, field names, error messages
   - Note any existing bugs or issues you encounter
2. **Write the test plan file** immediately to \`${config.directories.testPlans}/\`:
   - Filename matches the checklist (e.g., \`01-auth-onboarding.md\`)
   - Include: header, prerequisites, numbered test cases
   - Test cases cover: happy path, edge cases, validation, error handling
   - Use the format: \`| ID | Test Case | Steps | Expected Result |\`
   - Aim for 20-50 test cases per section
   - Reference specific DB tables/columns where relevant
   - Include cleanup steps where test data is created
   - Where relevant, add test cases inspired by the Industry Best Practices documented in CLAUDE.md
3. **Update CLAUDE.md** — mark the section done (\`[x]\`) and add any new patterns or schema discoveries found during exploration
4. Move to the next section

---

### Stage 4: Final Review

1. Re-read CLAUDE.md — verify all sections are checked off and documentation is complete
2. Scan test plan files for consistent numbering and no gaps

---

## Context Management Rules — CRITICAL

- **Write to disk immediately** — every disk write is a checkpoint that survives compaction and crashes
- **Never hold large findings only in context** — if you discovered something important, write it to CLAUDE.md or the test plan file before moving on
- **Use /compact proactively** between sections when context feels large (e.g., after exploring a complex section with many DOM snapshots)
- **After compaction, always re-read CLAUDE.md first** to regain the navigation map, schema, progress state, and patterns before continuing
- If you resume after a crash, read CLAUDE.md, find the first unchecked section, and continue from there

Start by navigating to the application URL.`;
}

/**
 * Build the prompt for the execute phase (Sonnet runs test plans).
 */
export function buildExecutePrompt(config, planFiles) {
  const planList = planFiles
    .map((f) => `- ${config.directories.testPlans}/${f}`)
    .join('\n');

  return `You are a QA tester executing test plans for "${config.name}".

## Application
- **URL**: ${config.url}
- **Test account**: ${config.auth.email}
- **Password**: Read from the HIVETEST_PASSWORD environment variable (run: echo $HIVETEST_PASSWORD in bash)

## Test Plans to Execute
${planList}

## Instructions

Execute each test plan sequentially. For each test plan file:

1. **Read the test plan** from the testplans/ directory
2. **Create the results file** in results/ with ALL test cases pre-populated as PENDING
3. **Execute each test case** using the browser (Playwright MCP) and database queries:
   - Navigate to the relevant page
   - Perform the steps described
   - Verify expected results in both UI and database
   - Record PASS, FAIL, or BLOCKED
4. **Update the results file IMMEDIATELY after EACH test case** — do not batch updates
5. After completing all cases in a file, move to the next plan

## Results File Format
\`\`\`markdown
# XX - Section Name Results
**Run date**: ${new Date().toISOString().split('T')[0]}
**Tester**: ${config.auth.email}

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| ID-001 | Description | PASS/FAIL/BLOCKED | details |

## Bugs Found
- **BUG-001**: [description]

## Notes
- observations
\`\`\`

## Important Rules
- Use clearly fake test data (names like "Test Patient Alpha")
- Never use real phone numbers — use +1-555-01XX format
- Never use real emails — use testXXX@example.com format
- After EVERY test case, update the results file immediately
- If you encounter a bug, note it in the results file
- Use /compact if context gets large, then continue from the results file

Start by reading the first test plan and logging into the application.`;
}
