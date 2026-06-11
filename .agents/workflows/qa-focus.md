---
description: QA Focus, test and fix.
---

Focus mode for this run:
Audit every visible screen state and every intended interactive control.

For each screen:
- identify all states the screen can enter
- verify each state renders correctly
- verify each visible button, link, tab, toggle, menu, dialog trigger, and form control works
- verify empty/loading/success/error/disabled states
- capture screenshots of major states
- fix broken wiring, state handling, layout issues, and misleading UI
- add Playwright coverage for the validated states

Do not leave behind dead buttons, fake controls, placeholder actions, or visually broken states.