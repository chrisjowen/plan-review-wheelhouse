# plan-review-wheelhouse

A [Wheelhouse](https://github.com/chrisjowen/wheelhouse) plugin that adds a **Plan review** tab to each task. Read the task's plan as Wheelhouse's document reader draws it, comment on a line or a passage, approve it or ask for changes, and send everything to Firstmate as one list. Firstmate passes it to the task's worker, the same way a list from a task's Preview tab goes.

![The Plan review tab on a task: the plan on the left with a note under step 2, and on the right the review with two notes, Request changes chosen, a note on the whole plan and the Send to Firstmate button](docs/images/review.png)

It is Wheelhouse's own way to review a plan, built on Firstmate's flow rather than beside it: nothing runs its own agent loop or keeps its own approval record. Your notes and your verdict go to Firstmate's inbox as one message about the task, and Firstmate decides what happens next.

## Install

```sh
wheelhouse plugin install chrisjowen/plan-review-wheelhouse
```

Or use **Settings → Plugins → Install plugin** with `chrisjowen/plan-review-wheelhouse`. Before anything is installed, Wheelhouse shows that the plugin **sends Firstmate feedback lists about a task, each when you click to send it**; that is the only thing it sends. It is off until you turn it on in **Settings → Plugins → Plan review**, for every project or only some.

Sending needs a Wheelhouse with the plugin `feedback` capability ([chrisjowen/wheelhouse#98](https://github.com/chrisjowen/wheelhouse/pull/98)). On an older Wheelhouse, **Send to Firstmate** stays off and the tab says Wheelhouse needs updating.

## Using it

Open a task and pick the **Plan review** tab.

**The documents.** The tab offers the task's Markdown documents in Firstmate's home, `data/<task>/plan.md`, `spec.md` and `report.md` first, then any other `.md` there (Firstmate's briefs last), and any Markdown file the task changed in its worktree. **Another file…** opens any Markdown (`.md`) file by path: one relative to the Firstmate home, such as `data/<task>/plan.md`, or a full path inside a live task's project or worktree. It is read through Wheelhouse's own document reader, so it keeps to the same folders, and the tab remembers it for that task. The document renders as Wheelhouse's reader renders it: GitHub-flavoured Markdown, with nothing in it that can run.

**Commenting.** Each paragraph, heading, list item, table and code block shows its line number. Hover over it and click **+** to write a note about those lines. Or select a passage and click **Comment on this**: the note quotes what you selected, with its lines. Notes sit under the text they are about, and **Edit** and **Remove** are beside each one. **⌘↵** (Ctrl+Enter) saves a note and **Esc** leaves it.

![A passage selected in step 3 of the plan, with the Comment on this button above it](docs/images/selection.png)

**Your review.** Beside the document (below it on a narrow page) are your notes in the order they appear, each one a click away. Choose **Approve** or **Request changes**, and add a note about the plan as a whole if you like. **Send to Firstmate** first reads the document again through Wheelhouse's document reader, whole, and sends it all as one list only if it is the text you started your review on. If it changed since then, nothing is sent: the tab says so and offers **Use the new text**, which moves your notes onto the new text (see **Drafts**) so you can check them and send again. The same goes for a file opened by path. Anything you add or change while a review is sending stays in your draft. Approving with nothing to add still sends one line, _Approved as written. Go ahead._, so Firstmate hears your verdict. Requesting changes needs at least one note. On a narrow page a bar at the bottom keeps **Send to Firstmate** in view (or **Finish your review**, which takes you to the verdict).

**Drafts.** Your notes, verdict and overall note are kept in this browser per task and document until you send them, so you can leave and come back. A dot on a document's name means it has a draft. **Discard this draft** clears it. If the document changes while you have a draft, the tab shows the new text and says so, but your notes stay with the text you wrote them on until you click **Move notes onto this text**: then each note moves to where its quote now is, and a note whose text is gone is marked **text changed**. A document longer than 64 KB is shown, and its draft opened, once its whole text has been read.

### What Firstmate receives

Wheelhouse writes the message, not the plugin, in the same shape as a list from a task's Preview tab, and sends it to Firstmate's inbox as one note about the task (`Re: <task>`):

```
Feedback for share-links (Share a board with a read-only link), sent together from the “Plan review” plugin (plan-review), about data/share-links/plan.md: Request changes:
1. Close. Settle who can take links back and how fresh shared boards are, then go ahead.
2. Say whether admins can take a link back too, not only the owner.
   Points at: “Add POST /boards/:id/links to make a link, and DELETE /links/:token to take one back.” (lines 13–15)
3. A minute is stale for a live board. Push updates, or refresh every 10 seconds.
   Points at: “refreshed every minute” (line 24)

Firstmate: pass these to this task’s worker, the same task (start no new one). You may add notes of your own, marked as yours.
```

The overall note comes first, then each note in the order of the document, with what it quotes and its lines. The chat shows the list as your card, addressed to Firstmate, with whether Firstmate has it and its reply.

![The sent review in Firstmate's chat: a Plan review feedback card for the task, about data/share-links/plan.md: Request changes, with its three numbered notes and Sent to Firstmate](docs/images/chat.png)

A list holds up to 30 lines of up to 500 characters each, Wheelhouse's limits for one feedback list; the tab says so before you send if a review goes over.

## What it reads and sends

- **Reads.** The tab's provider, run by Wheelhouse on the server, lists `data/<task>/` in the Firstmate home and reads up to 8 Markdown files there, and up to 4 Markdown files the task changed in its worktree, each up to 64 KB (Wheelhouse's limit for plugins). For each Markdown file the task changed, it asks git for the worktree's full path, so the tab can read that file again. A longer document, in the home or the worktree, is read whole, when you open it, through Wheelhouse's document reader (`/api/files`), as is a file you open by path; and on **Send to Firstmate** the document is read again the same way, to check it is unchanged.
- **Sends.** Only when you click **Send to Firstmate**, through Wheelhouse's `feedback` capability, as one list about the task the tab is on. There is no other way for it to message Firstmate. It has no companion service or settings, and the tab talks only to Wheelhouse.
- **Keeps.** Drafts, the files you opened by path, and what you last sent are kept in this browser's local storage, not in the Firstmate home.

## Development

```sh
npm ci
npm test       # node --test: the provider, the review list, Markdown rendering and the tab in jsdom
npm run lint   # ESLint and Prettier
```

- `.wheelhouse-plugin/plugin.json` is the manifest: one `task.section` contribution and the `feedback` capability.
- `wheelhouse/server/index.js` is the server entry: the `docs` provider.
- `wheelhouse/ui/index.js` is the tab, the custom element `plan-review-section`; `doc.js` renders the document into parts that know their lines, `notes.js` turns the review into the feedback list, and `styles.js` uses only Wheelhouse's CSS variables, so the tab follows the light and dark themes.
- `wheelhouse/ui/vendor/` holds the Markdown libraries Wheelhouse's own reader uses, at the same versions: marked 16.4.2 (MIT) and DOMPurify 3.4.17 (Apache-2.0 or MPL-2.0), each with its licence header. Wheelhouse loads installed plugins without a build step, so they are copied in as they ship. After changing a version in `package.json`, run `npm install && npm run vendor`; a test checks the copies match.

## Licence

MIT
