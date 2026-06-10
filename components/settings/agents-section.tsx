import { AGENTS, MENTOR_MAP, NICK_TC_FEE, SPLIT_TIER_LABELS, type SplitTier } from "@/lib/agents";

const TIER_COLORS: Record<SplitTier, string> = {
  "80/20": "bg-amber-100 text-amber-800 border-amber-200/60",
  "90/10": "bg-emerald-100 text-emerald-800 border-emerald-200/60",
  "75/25": "bg-sky-100 text-sky-800 border-sky-200/60",
  "50/50": "bg-violet-100 text-violet-800 border-violet-200/60",
};

const TIERS: SplitTier[] = ["80/20", "90/10", "75/25", "50/50"];

export function AgentsSection() {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">Team Steady Agents</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Split tiers and mentor assignments for commission calculations.
        </p>
      </div>

      <div className="divide-y divide-slate-100">
        {TIERS.map((tier) => {
          const agents = AGENTS.filter((a) => a.splitTier === tier);
          return (
            <div key={tier} className="px-6 py-5">
              <div className="flex items-center gap-2 mb-4">
                <span
                  className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${TIER_COLORS[tier]}`}
                >
                  {SPLIT_TIER_LABELS[tier]}
                </span>
                <span className="text-xs text-slate-400">{agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {agents.map((agent) => {
                  const mentorId = agent.mentorId;
                  const mentorName = mentorId
                    ? AGENTS.find((a) => a.id === mentorId)?.name
                    : null;
                  const mentees = MENTOR_MAP[agent.id] ?? [];
                  const menteeNames = mentees
                    .map((mid) => AGENTS.find((a) => a.id === mid)?.name)
                    .filter(Boolean);

                  return (
                    <div
                      key={agent.id}
                      className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-slate-900">{agent.name}</p>
                      {agent.id === "nick-martin" ? (
                        <>
                          <p className="text-xs text-slate-500 mt-1">
                            ${NICK_TC_FEE} TC fee from team share → added to agent amount
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Remainder → Sam / Taylor / Lars (33.33% each)
                          </p>
                        </>
                      ) : (
                        <>
                          {mentorName && (
                            <p className="text-xs text-slate-500 mt-1">
                              Mentor:{" "}
                              <span className="font-medium text-slate-700">{mentorName}</span>
                            </p>
                          )}
                          {menteeNames.length > 0 && (
                            <p className="text-xs text-slate-500 mt-1">
                              Mentoring:{" "}
                              <span className="font-medium text-slate-700">
                                {menteeNames.join(", ")}
                              </span>
                            </p>
                          )}
                          {!mentorName && menteeNames.length === 0 && (
                            <p className="text-xs text-slate-400 mt-1">No mentor assigned</p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
