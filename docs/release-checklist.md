# NotebookPilot Release Checklist

## Automated checks

- [ ] `npm install`
- [ ] `npm run check-types`
- [ ] `npm run lint`
- [ ] `npm run compile`
- [ ] `npm run package`
- [ ] `npm test` completes in the local VS Code environment

## Manual smoke test

- [ ] Launch the Extension Development Host with `F5`.
- [ ] Open a copy of a real `.ipynb` notebook.
- [ ] Open the NotebookPilot Activity Bar view.
- [ ] Run, insert, edit, and delete a selected cell.
- [ ] Use `@notebook` to inspect a cell and its output.
- [ ] Confirm deletion requires approval.
- [ ] Confirm a failed operation reports its error and does not silently continue.
- [ ] Confirm the notebook remains usable after cancellation.

## Collaboration and packaging

- [ ] Fetch `origin/main` before committing.
- [ ] Keep test notebook outputs out of feature commits.
- [ ] Review `git diff --check`.
- [ ] Push only focused commits to `main`.
- [ ] Attach benchmark results and demo evidence to the release notes.
