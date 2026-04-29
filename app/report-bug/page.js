import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { submitBugReportAction } from "./actions";
import { getSiteCopy } from "@/lib/site-config";

function BugNotice({ searchParams }) {
  const submitted = searchParams?.submitted === "1";
  const error = searchParams?.error;

  if (!submitted && !error) {
    return null;
  }

  return (
    <div className={`card ${error ? "noticeError" : "noticeSuccess"}`}>
      {submitted ? <p>Bug report sent. Thanks for flagging it.</p> : null}
      {error ? <p>Could not send bug report: {decodeURIComponent(error)}</p> : null}
    </div>
  );
}

export default async function ReportBugPage({ searchParams }) {
  const siteCopy = await getSiteCopy();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/report-bug");
  }

  const params = (await searchParams) || {};
  const pagePath = typeof params.from === "string" ? params.from : "";
  const name =
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    "there";

  return (
    <div className="stack">
      <section className="card">
        <h1>{siteCopy.reportBugTitle}</h1>
        <p>{siteCopy.reportBugDescription}</p>
      </section>

      <BugNotice searchParams={params} />

      <section className="card">
        <h2>{siteCopy.reportBugFormTitle}</h2>
        <p>{siteCopy.reportBugFormDescription}</p>
        <form action={submitBugReportAction} className="bugReportForm">
          <label className="stack">
            <span>Signed in as</span>
            <input className="input" value={`${name}${user.email ? ` · ${user.email}` : ""}`} disabled />
          </label>
          <label className="stack">
            <span>Short summary</span>
            <input
              className="input"
              name="summary"
              maxLength={140}
              placeholder="Example: Saving a 2048 score failed after I joined a class"
              required
            />
          </label>
          <div className="adminNameGrid">
            <label className="stack">
              <span>Page or feature</span>
              <input
                className="input"
                name="page_path"
                defaultValue={pagePath}
                placeholder="/play/2048 or Teacher Dashboard"
              />
            </label>
            <label className="stack">
              <span>How urgent is it?</span>
              <select className="input" name="severity" defaultValue="normal">
                <option value="minor">Minor annoyance</option>
                <option value="normal">Normal bug</option>
                <option value="major">Major problem</option>
                <option value="blocking">Blocking me completely</option>
              </select>
            </label>
          </div>
          <label className="stack">
            <span>What happened?</span>
            <textarea
              className="input bugTextarea"
              name="details"
              placeholder="What did you click, what did the site do, and did any error text appear?"
              required
            />
          </label>
          <label className="stack">
            <span>What did you expect instead?</span>
            <textarea
              className="input bugTextarea"
              name="expected_behavior"
              placeholder="Example: I expected the class leaderboard to load and show my classmates."
            />
          </label>
          <div className="ctaRow">
            <button className="btn primary" type="submit">Send Bug Report</button>
          </div>
        </form>
      </section>
    </div>
  );
}
