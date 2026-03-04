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

## Your Task

### Phase 1: Explore the Application
1. Navigate to ${config.url} and log in with the test account
2. Systematically explore EVERY section, page, and feature of the application
3. Click through all navigation items, tabs, dropdowns, modals, and forms
4. Note the URL structure, UI patterns, and available features
5. Query the database schema via the database MCP tool to understand the data model

### Phase 2: Generate CLAUDE.md
Create/update CLAUDE.md in the current directory with:
- Application overview and structure
- Complete sidebar navigation map (section → URL path → description)
- Database schema documentation (tables, key columns, enums, relationships)
- Test account details and key entity IDs
- Naming conventions and patterns observed
- Testing workflow instructions for executing test plans
- Production safety rules

### Phase 3: Generate Test Plans
Create numbered test plan files in the "${config.directories.testPlans}/" directory:
- One file per major feature area (e.g., 01-auth-onboarding.md, 02-patients.md, etc.)
- Each test plan should have:
  - A header with the section name
  - Prerequisites (what must exist before running)
  - Numbered test cases with: ID, description, steps, expected result
  - Test cases should cover: happy path, edge cases, validation, error handling
  - Use the format: \`| ID | Test Case | Steps | Expected Result |\`
- Aim for thorough coverage — 20-50 test cases per major section
- Number files with zero-padded prefixes (01, 02, 03...)
- Order from foundational (auth, setup) to dependent features

### Guidelines
- Be thorough — explore every button, link, and form
- Test with both valid and invalid inputs during exploration
- Note any existing bugs or issues you encounter
- Reference specific DB tables/columns in test cases where relevant
- Include cleanup steps where test data is created

Start by navigating to the application URL.`;
}

/**
 * Build the prompt for the execute phase (Sonnet runs test plans).
 */
export function buildExecutePrompt(config, planFiles, password) {
  const planList = planFiles
    .map((f) => `- ${config.directories.testPlans}/${f}`)
    .join('\n');

  return `You are a QA tester executing test plans for "${config.name}".

## Application
- **URL**: ${config.url}
- **Test account**: ${config.auth.email}
- **Password**: ${password}

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
${config.jira ? `- For bugs, note them but do NOT create Jira tickets automatically` : ''}
- Use /compact if context gets large, then continue from the results file

Start by reading the first test plan and logging into the application.`;
}
