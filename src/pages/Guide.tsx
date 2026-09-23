import { Link } from 'react-router';

function Flow() {
  const ballots = [
    { n: 1, after: null },
    { n: 2, after: 'Candidates with less than ⅕ of the total vote are withdrawn — the top two remain' },
    { n: 3, after: 'Candidates with less than ⅓ of the total vote are withdrawn — the top two remain' },
    { n: 4, after: 'The candidate with the smallest total is withdrawn — the top two remain' },
  ];
  return (
    <div className="flow" role="img" aria-label="Flowchart of the Third Legacy Procedure">
      {ballots.map((b) => (
        <div key={b.n} className="flow-row">
          <div className="flow-box flow-ballot">Ballot {b.n}</div>
          <div className="flow-arrow">→</div>
          <div className="flow-box flow-q">Does one candidate have ⅔ of the total vote?</div>
          <div className="flow-yes">
            <span className="flow-tag yes">YES</span> Elected
          </div>
          {b.after && (
            <div className="flow-no">
              <span className="flow-tag no">NO</span> {b.after}
            </div>
          )}
        </div>
      ))}
      <div className="flow-row">
        <div className="flow-box flow-motion">Chair asks for a motion, second and simple majority of hands for a fifth and final ballot</div>
        <div className="flow-split">
          <div>
            <span className="flow-tag no">Defeated</span> → 🎩 Go to the hat
          </div>
          <div>
            <span className="flow-tag yes">Carried</span> → Ballot 5
          </div>
        </div>
      </div>
      <div className="flow-row">
        <div className="flow-box flow-ballot">Ballot 5</div>
        <div className="flow-arrow">→</div>
        <div className="flow-box flow-q">⅔ of the total vote?</div>
        <div className="flow-yes">
          <span className="flow-tag yes">YES</span> Elected
        </div>
        <div className="flow-no">
          <span className="flow-tag no">NO</span> 🎩 Go to the hat — the top two remain; the first name drawn is elected
        </div>
      </div>
    </div>
  );
}

export function Guide() {
  return (
    <div className="guide">
      <h1>The Third Legacy Procedure</h1>
      <blockquote>
        “A.A.’s Third Legacy Procedure is a special type of electoral procedure, used primarily for the election of delegates and regional and at-large
        trustees. … In practice, it has proved highly successful in eliminating the influence of factions or parties … More importantly, a second-place
        candidate who may be extremely well qualified but without early popular support is encouraged to stay in the balloting rather than withdraw.”
        <footer>
          — <cite>The A.A. Service Manual</cite> (2024–2026), Appendix G
        </footer>
      </blockquote>
      <p>
        Bill W. explained it as a protection for minorities: “Unless the majority candidate can poll a two-thirds vote … he must place his name in a hat
        with one or more of the choices of the Assembly minority. … we actually have found that our Third Legacy method of electing Delegates has much
        strengthened the spirit of democracy among us. Unity has been cemented, cooperation has been increased, and when the Delegate is finally chosen,
        no discontented minority can trail in his wake.” (Twelve Concepts for World Service, Concept V.) Under Concept IX he adds that it “has greatly
        reduced political friction; it has made each Delegate feel that he or she is truly a world servant rather than just the winner of a contest.”
      </p>

      <h2>The procedure</h2>
      <ol className="steps">
        <li>
          <strong>Post the candidates.</strong> The names of eligible candidates are posted on a board. All voting members cast written ballots, one
          choice to a ballot. The tally for each candidate is posted on the board.
        </li>
        <li>
          <strong>Two-thirds elects.</strong> The first candidate to receive <strong>two-thirds of the total vote</strong> is elected. Exactly two-thirds
          is enough (20 of 30).
        </li>
        <li>
          <strong>After the 2nd ballot</strong> — withdrawals start. Any candidate with <strong>less than one-fifth</strong> of the total vote is
          automatically withdrawn, except that the <strong>top two candidates must remain</strong>. (If there are ties for second place, the top
          candidate and all tied runners-up remain.)
        </li>
        <li>
          <strong>After the 3rd ballot</strong> — candidates with <strong>less than one-third</strong> of the total vote are withdrawn automatically,
          except the top two remain (with the same rule for ties).
        </li>
        <li>
          <strong>After the 4th ballot</strong> — if no one has two-thirds, the candidate with the <strong>smallest total</strong> is automatically
          withdrawn, except that the top two remain. The chair then asks for a <strong>motion, a second, and a simple majority of hands</strong> on
          conducting a fifth and final ballot. If the motion is <strong>defeated</strong>, balloting is over and the choice is made by lot — “going to
          the hat” — immediately. If it <strong>carries</strong>, a fifth and final ballot is held.
        </li>
        <li>
          <strong>After the 5th ballot</strong> — if no one is elected, the chair announces that the choice will be made by lot. The top two candidates
          remain: if there are ties for first place, all tied first-place candidates remain; otherwise the top candidate and any tied second-place
          candidates remain.
        </li>
        <li>
          <strong>The hat.</strong> Lots are drawn by the teller, and <strong>the first one “out of the hat”</strong> is the delegate (or trustee or other
          officer).
        </li>
      </ol>
      <h3>Flowchart</h3>
      <Flow />

      <h3>“The top two candidates remain” and ties</h3>
      <p>
        No automatic withdrawal can remove the top two. If two or more candidates tie for first, all of them stay. If one leads and several tie for
        second, the leader and <em>all</em> of the tied runners-up stay. Only candidates <em>strictly below</em> the limit are withdrawn — a candidate
        with exactly one-fifth (or one-third) stays.
      </p>

      <h2>A worked example</h2>
      <p>60 votes are cast on every ballot, so two-thirds is 40, one-fifth is 12 and one-third is 20.</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Candidate</th>
              <th className="num">1st</th>
              <th className="num">2nd</th>
              <th className="num">3rd</th>
              <th className="num">4th</th>
              <th className="num">5th</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Ann</th>
              <td className="num">20</td>
              <td className="num">22</td>
              <td className="num">23</td>
              <td className="num">35</td>
              <td className="num">39</td>
            </tr>
            <tr>
              <th>Bob</th>
              <td className="num">15</td>
              <td className="num">15</td>
              <td className="num">19</td>
              <td className="num">25</td>
              <td className="num">21</td>
            </tr>
            <tr>
              <th>Cal</th>
              <td className="num">12</td>
              <td className="num">12</td>
              <td className="num">18 ✕</td>
              <td />
              <td />
            </tr>
            <tr>
              <th>Dee</th>
              <td className="num">8</td>
              <td className="num">11 ✕</td>
              <td />
              <td />
              <td />
            </tr>
            <tr>
              <th>Eve</th>
              <td className="num">5</td>
              <td className="num">0 ✕</td>
              <td />
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <ul>
        <li>After the 1st ballot nobody is withdrawn automatically.</li>
        <li>After the 2nd: Dee (11) and Eve (0) are below one-fifth (12) and withdrawn. Cal has exactly 12 — not <em>less</em> than one-fifth — so stays.</li>
        <li>After the 3rd: Cal (18) is below one-third (20) and withdrawn. Bob (19) is also below one-third but stays as one of the top two.</li>
        <li>After the 4th: nobody has 40, so the assembly votes on a fifth ballot. The motion carries.</li>
        <li>On the 5th ballot Ann has 39 — one short of two-thirds. Ann and Bob go into the hat; the first name out is the delegate.</li>
      </ul>

      <h2>Running an election assembly</h2>
      <p>The Service Manual’s sample election-assembly format (Appendix D), and where the app helps:</p>
      <ol className="steps">
        <li>
          The chair reviews the election procedure and the area’s guidelines for <strong>who votes</strong>, and asks the assembly to approve them and the{' '}
          <strong>order of election</strong> (usually delegate first, then alternate delegate, chair, secretary, treasurer…). <em>App: the opening
          explanation and approval checkboxes, recorded in the log.</em>
        </li>
        <li>
          Eligible names (full names and districts) are read or written on the board. The chair asks whether anyone is unable to serve; those names are
          removed. Some areas allow nominations from the floor. <em>App: nominations, districts, posting order.</em>
        </li>
        <li>
          Paper ballots are distributed — some areas use <strong>colour-coded ballots</strong> for each round. <em>App: ballot colours and printable
          slips.</em>
        </li>
        <li>
          The secretary <strong>calls the roll</strong> of voting members. <em>App: registration &amp; roll call, including virtual attendees.</em>
        </li>
        <li>
          Two non-voting members serve as <strong>tellers</strong>, two as <strong>collectors</strong>, and one records and tallies the votes.{' '}
          <em>App: election officials; teller devices; the board.</em>
        </li>
        <li>
          Ballots are cast, collected and counted, and the votes written on the board as the election proceeds. <em>App: ballot entry and the
          projector display.</em>
        </li>
        <li>
          The alternate delegate is elected next by the same procedure, followed by the other officers. <em>App: copy candidates who were not elected
          to the next position.</em>
        </li>
        <li>
          A report of the assembly, with the names of those elected and those attending, goes to the Conference secretary at GSO.{' '}
          <em>App: the report, attendance, and text summary.</em>
        </li>
      </ol>
      <p>
        “An assembly makes its own rules … If members want to make a change in the rules, it should be done before a vote is taken, or before an
        election is conducted. In an election assembly, stick to the Third Legacy Procedure and discourage departures from it.” The app locks the
        procedure settings once the first ballot is recorded.
      </p>

      <h2>Trustee elections</h2>
      <ul>
        <li>
          <strong>Area selection of a trustee candidate.</strong> Each area may submit one candidate for regional trustee (and for trustee-at-large when
          there is a vacancy). Most areas select their candidate by the Third Legacy Procedure.
        </li>
        <li>
          <strong>Regional trustee nominating session</strong> (at the General Service Conference). The voters are the <strong>delegates from the
          region</strong> plus an <strong>equal number</strong> of other voters — one-half from the Conference Committee on Trustees and one-half from
          the trustees’ Nominating Committee. The session follows the Third Legacy Procedure. <em>App: choose “Regional trustee nominating session”; the
          roll call checks the balance of voters.</em>
        </li>
        <li>
          <strong>Trustee-at-large.</strong> Delegates from each region caucus and use the Third Legacy Procedure to reduce the list to one candidate
          per U.S. region (two per Canadian region). The voting members then select a nominee: all delegates from that country and all members of the
          trustees’ Nominating Committee.
        </li>
      </ul>

      <h2>Hybrid assemblies: in-person and virtual voters</h2>
      <ul>
        <li>
          <strong>Register each voter once</strong>, in one channel, and check them in at the door or in the virtual waiting room. One person, one vote —
          no proxies or absentee ballots. An alternate votes only when their GSR (or DCM) is absent.
        </li>
        <li>
          <strong>Voting cards and the check-in desk.</strong> Print a card for each member (eight to a page) and scan them at the door with a laptop or
          tablet camera — the desk shows each person's name, role and whether they have a vote. A lost card is no problem: the desk can also find the
          name.
        </li>
        <li>
          <strong>In the room</strong>, voters write one name on the paper ballot. Tellers count — by hand, by tapping in the app, or on their own
          phones using the teller QR code.
        </li>
        <li>
          <strong>Online</strong>, use an anonymous single-choice poll with the remaining candidates (the app writes the poll text for each ballot). The
          virtual teller enters the results or imports the platform’s poll report (CSV); duplicate responses are counted once.
        </li>
        <li>
          <strong>Both channels are added together.</strong> Two-thirds, one-fifth and one-third are always worked out on the <em>combined</em> total
          vote.
        </li>
        <li>
          <strong>The fifth-ballot motion</strong> is a show of hands: count hands in the room and raised hands (or a yes/no poll) online. A tie is not a
          majority.
        </li>
        <li>
          <strong>Going to the hat</strong> can be a physical hat (record the order drawn) or the app’s secure random draw, shown on the projector and
          shared screen.
        </li>
      </ul>

      <h2>Points your area should decide</h2>
      <p>The Service Manual does not spell out every detail. These are settings on each election and are printed on the report:</p>
      <ul>
        <li>
          <strong>What “total vote” means.</strong> Default: valid votes for candidates on the board. Blank, spoiled, or ballots for someone not on the
          board are recorded but not counted. You can choose to count all ballots cast instead.
        </li>
        <li>
          <strong>Ties for the smallest total after the 4th ballot.</strong> Default: all tied candidates are withdrawn (the top two always remain).
        </li>
        <li>
          <strong>A single candidate.</strong> Default: a yes/no ballot requiring two-thirds “yes”. Alternatively, declare them elected.
        </li>
        <li>
          <strong>Minority opinion.</strong> Optionally, after the fifth-ballot motion the chair can hear from the minority, and a motion to reconsider
          may lead to a re-vote.
        </li>
        <li>
          <strong>Second name from the hat.</strong> Some areas elect the alternate delegate as the second name drawn from the delegate hat. Off by
          default; set per position.
        </li>
        <li>
          <strong>One office per person.</strong> By default someone already elected cannot be added as a candidate for a later position.
        </li>
      </ul>

      <h2>Your data</h2>
      <p>
        This app runs entirely in your browser and keeps working offline once loaded. Elections are saved on this device only — nothing is uploaded.
        Teller devices exchange counts through QR/text codes, not a server. Use <strong>Back up everything</strong> or <strong>Export (.json)</strong> to
        keep a copy or move to another computer, and <strong>Report</strong> to print or save a PDF.
      </p>
      <p>
        Best of all, set up <strong>automatic backup</strong> on the assembly page: choose a folder once — a USB stick, or a folder that syncs — and the
        app writes the whole election there after every ballot, with a time-stamped snapshot of each step. If the laptop closes or the browser is
        cleared, open the file and carry on.
      </p>

      <p className="muted small">
        Quotations from The A.A. Service Manual combined with Twelve Concepts for World Service, 2024–2026 edition (Appendix D: sample election
        assembly format; Appendix G: Third Legacy Procedure; “The General Service Board” for trustee selection). Always follow your own area’s or
        district’s guidelines where they differ. This is an independent tool and is not affiliated with or endorsed by Alcoholics Anonymous World
        Services, Inc.
      </p>
      <p>
        <Link to="/">← Back to elections</Link>
      </p>
    </div>
  );
}
