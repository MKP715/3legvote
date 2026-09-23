# Third Legacy Vote

**Live app: https://mkp715.github.io/3legvote/**

A free, open-source web app for running **A.A. service elections by the Third Legacy Procedure** — for area assemblies, districts, intergroups and trustee elections, with **in-person and virtual voters**.

It runs entirely in the browser and works offline once loaded. Nothing is uploaded: each election is stored on the device that runs it, with export/import for backup. Teller devices exchange counts through QR/text codes, not a server.

## The procedure

This follows *The A.A. Service Manual* (2024–2026), Appendix G, exactly:

- Candidates' names are posted. Each voter writes **one name** per ballot.
- **Two-thirds of the total vote elects.** Exactly two-thirds counts (20 of 30 elects).
- **After the 2nd ballot**, anyone with **less than one-fifth** of the total vote is automatically withdrawn.
- **After the 3rd ballot**, anyone with **less than one-third** is automatically withdrawn.
- **After the 4th ballot**, the **smallest total** is withdrawn. The chair then takes a **motion, a second, and a simple majority of hands** on a fifth and final ballot.
  - If the motion is **defeated**, the choice is made by lot ("going to the hat") immediately.
  - If it **carries**, a 5th ballot is held; if nobody reaches two-thirds on it, the choice goes to the hat.
- **The top two candidates always remain.** If two or more tie for first, all of them stay. Otherwise the leader and everyone tied for second stay.
- **The first name out of the hat is elected.**

All the arithmetic uses whole numbers, so there are no rounding mistakes.

## Features

**Running the election**
- Multiple positions, elected in an approved order. Candidates who aren't elected can be copied to the next position. By default, one person can hold only one office. You can add further seats for the same office.
- Election types from the Service Manual, each with its own positions and voter roles:
  - area election assembly
  - district
  - area selection of a trustee candidate
  - **regional trustee nominating session** — checks that there are as many other voters as region delegates, split half Conference Committee on Trustees and half trustees' Nominating Committee
  - trustee-at-large
  - intergroup
  - custom
- The chair's opening explanation to read aloud. The assembly's approval of the procedure, who votes, and the order of election is recorded (Appendix D).
- Nominations with full names and districts. The posting order can be alphabetical or drawn at random. Candidates can withdraw voluntarily, and a withdrawal can be taken back.
- A procedure stepper that mirrors the flowchart in Appendix G.
- The chair's announcement after every ballot, in **English, Spanish or French**.
- Fifth-ballot motion counted by hands in the room and online. A tie is not a majority. An optional step records a minority opinion and a motion to reconsider.
- Going to the hat with a secure, unbiased digital draw, or by recording a physical draw. Optionally, the second name drawn fills another position (a practice in some areas).
- Single-candidate yes/no confirmation ballots.

**Hybrid voting (in-person and virtual)**
- Every ballot records in-person and virtual counts separately. Thresholds are always worked out on the **combined** total.
- **Registration and roll call**: check people in as in-person or virtual. The app applies one person, one vote, and lets an alternate vote only when their GSR or DCM is absent. You can import and export the roll as CSV.
- Eligible voters are recorded with every ballot. The app warns if a channel has more ballots than voters, or if the ballots collected don't match the count.
- **Teller devices**: tellers scan a QR code, count on their own phones, and hand back a report code that the chair scans or pastes. Several tellers' counts are added together. An updated report replaces the earlier one, and the same report can't be added twice.
- **Virtual poll import**: load a poll or form export as CSV (for example a Zoom poll report, Google Forms or Microsoft Forms). The app finds the answer column, counts each participant once, and treats answers with several names or an unknown name as invalid.
- Poll text for each ballot, ready to paste into your meeting platform.

**The rest of the assembly's business**
- **Motions and substantial unanimity** (Appendix W). Record yes / no / abstain in the room and online; the app shows how many votes are needed *before* you record anything, checks the quorum, and decides the motion. Two-thirds for matters of policy, "one-half of votes cast plus one" for routine matters, three-quarters where an area requires it. Abstentions are not votes cast unless your area says they are.
- Amend, table, recommit, call the question, decline to consider and reconsider, each with the second, debatability and vote the Service Manual gives it. A committee recommendation needs no second; nothing may be reconsidered twice. Carrying an amendment rewrites the motion; tabling and recommitting set its status.
- **The side that did not prevail is always invited to speak** — the app names it, records what was said, and offers the motion to reconsider.
- Speaker counts for and against, and a two-minute speaker timer on the projector.
- **Conference agenda items**: each with its committee, background and links (printed as QR codes), the notes taken during the discussion, and a poll of the room and the online voters on whatever choices you set. The result is reported as the **sense of the assembly** and says whether it reached substantial unanimity or only a simple majority. A note for the delegate on every item, and a CSV delegate report for the lot. Items import from a spreadsheet; the thirteen Conference committees are built in.
- **Agenda runner**: load a sample format from Appendix D (election assembly, regular assembly, pre-Conference), set the start time, and the app lays out the clock times. Start an item and it tracks minutes used against minutes planned, with one-click "finish and start the next".

**Registration and badges**
- Registration options — assembly, convention, banquet, or whatever your area uses — and any extra detail the registrar collects, both editable and saved with the assembly.
- **Name badges**, 4, 6 or 8 to a sheet, single- or **double-sided** (the backs are laid out mirrored so each lands behind its own front, for long- or short-edge duplex). Your own heading, colour and logo; the member's service position, group, district, what they are signed up for and their check-in QR code; and a back with your own text, the day's agenda, and any links you provide printed as QR codes. The design is saved, so the same badges reprint all weekend.

**Registration desk**
- **Printable voting cards**, eight to a page, each with a QR code. The code identifies the member within that election only — no name or email is in it.
- **Check-in desk**: scan cards one after another with a laptop or tablet camera. Each scan shows the member's name, role and whether they have a vote (an alternate is told when their primary is present), with a sound for a good or bad scan. Checking out again is one click, and everything also works by searching for a name.
- Eligible voter counts update as people arrive and leave, so every ballot uses the right total.

**For the room**
- **Projector display** in a second window, which updates live and **scales itself to fit any screen**, so nothing is ever cut off. It shows: the position and where it sits in the assembly, "voting open" / "counting" status with the ballot colour, the total vote, two-thirds needed, ballots cast, **turnout against eligible voters**, a clock, what it takes to be elected and which withdrawal rule comes next, the board, a chart with the two-thirds line, the hat draw, a speaking timer, a message, and **a strip of every position showing who has been elected so far**.
- The projector also shows **the agenda** (what is happening now, what is next, and whether the day is running over), **a motion** with its wording, running tally and the two-thirds mark, and **a Conference item** with the choices and the sense of the assembly — all in the room's language.
- **Zoom the projector** for the room from the chair's window or with + / − / 0 on the projector itself, and a **high-contrast theme** for a washed-out screen or a bright hall.
- Colour-coded ballots for each round. Printable ballot slips, teller tally sheets, voting cards, and a large candidate board to post on the wall.

**Records and safety**
- **Automatic backup to a folder you choose** — a USB stick or a synced drive. After every ballot the app writes the whole election there: `latest.json` plus a time-stamped snapshot of each step, so a closed laptop or a cleared browser cannot lose the assembly. (Chrome and Edge; elsewhere the app prompts you to export.)
- Printable report (or save as PDF) **in English, Spanish or French** — headings, table columns and standing notes, not only the announcements. Organised as a record for the minutes: assembly details and settings, approvals and officials, a summary of the elections, each position with its board and the chair's announcements, every motion with the vote that decided it and the minority opinion, the Conference items with the sense of the assembly, the agenda as it actually ran, attendance with who had a vote, the full audit log, and signature lines for the chair, secretary and tellers.
- CSV export and a plain-text results summary.
- JSON backup and restore, for one election or everything at once.
- Procedure settings lock once voting starts (unlocking asks first and says how many results could change). Every correction is logged: reopening a ballot for a recount, undoing a motion or draw, or resetting a position.

**Guards against a wrong result**
- A candidate who withdraws while a ballot is being counted stays on *that* ballot, so the total vote — and the two-thirds threshold — cannot shrink underneath the votes already cast.
- Where the second name out of the hat fills another position, every slip must be drawn and recorded in order; undoing a draw never deletes a nominee the other position already had.
- A ballot cannot be undone while the next one is being counted, and clearing counts keeps teller links working.
- Teller reports are checked against the ballot they were counted for; a duplicate is refused and an updated one replaces the old.
- One bad record can never wipe the rest of your saved elections, a failed save is reported, and a screen error offers a reload instead of a blank page.
- The app warns if the same election is open in a second window, where the last save would win.

**App**
- Installable and works offline (PWA).
- Light and dark themes and a large-text mode.
- Works on phones, tablets, laptops and projectors.

## Settings each area decides

The Service Manual leaves some details open. You can set these per election, and they are printed on the report:

| Setting | Default |
|---|---|
| "Total vote" includes blank/invalid ballots? | No — valid votes only |
| Several candidates tie for the smallest total after the 4th ballot | All of them are withdrawn (the top two always remain) |
| Only one candidate | Yes/no ballot, two-thirds "yes" required |
| Minority opinion / reconsideration after the 5th-ballot motion | Offered |
| Second name out of the hat elected to another position | Off (set per position) |
| One office per person | On |
| Voting roles, and which roles are alternates | Preset by election type, editable |

## Development

```bash
npm install
npm run dev        # dev server (src/ is the Vite root)
npm test           # Vitest: 85 tests — rules engine, eligibility, poll import, teller codes, store
npm run build      # type-check + build + publish the site to the repository root
```

Builds are reproducible (the version shown in the footer comes from `package.json`), so CI can check that the site committed at the repository root matches `src/`. Bump the version when you publish a change.

GitHub Pages is set to **Deploy from a branch: `main` / (root)**. So `npm run build` compiles to `dist/`, and then `scripts/publish.mjs` copies the finished site (`index.html`, `assets/`, the service worker, the manifest and icons) to the repository root, next to a `.nojekyll` file. **After changing anything in `src/`, run `npm run build` and commit the regenerated files.** The CI workflow checks that the tests pass and the build succeeds.

Main modules:

| File | What it does |
|---|---|
| [`src/engine/thirdLegacy.ts`](src/engine/thirdLegacy.ts) | Pure rules engine: replays ballots, withdrawals, motions and draws to work out every result |
| [`src/engine/voters.ts`](src/engine/voters.ts) | Eligibility, alternates, one-person-one-vote, trustee balance |
| [`src/engine/pollImport.ts`](src/engine/pollImport.ts) | Virtual poll CSV import |
| [`src/engine/tellerCodes.ts`](src/engine/tellerCodes.ts) | Teller setup/report codes |
| [`src/i18n.ts`](src/i18n.ts) | Announcements in English, Spanish and French |
| [`src/store.ts`](src/store.ts) | State, persistence and the audit log |

Built with open-source libraries: React, React Router, Zustand + Immer, Chart.js + chartjs-plugin-annotation, Pico CSS, Papa Parse, FileSaver.js, nanoid, qrcode, jsQR, vite-plugin-pwa (Workbox), Vite, and Vitest.

## Disclaimer

This is an independent service tool. It is not affiliated with or endorsed by Alcoholics Anonymous World Services, Inc. Where your area's or district's guidelines differ, follow them.

## License

GPL-3.0 — see [LICENSE](LICENSE).
