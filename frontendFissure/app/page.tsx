"use client";

import { FormEvent, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/layout/sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DiffViewer } from "@/components/diff/diff-viewer";
import { SemanticCard } from "@/components/ai/semantic-card";
import { IntentCard } from "@/components/ai/intent-card";
import { ProphecyCard } from "@/components/ai/prophecy-card";
import { CodebaseChatCard } from "@/components/ai/codebase-chat-card";
import { LogTimeline } from "@/components/dashboard/log-timeline";
import { GraphPreview } from "@/components/dashboard/graph-preview";
import { ActionModal } from "@/components/common/action-modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { useApiMutation, useApiQuery } from "@/hooks/use-api";
import { gitService } from "@/services/git-service";
import type {
  AiSemanticDiff,
  CommitIntentResult,
  DiffLine,
  MergePreview,
  ProphecyReport,
  QueryResult,
  TrajectoryResponse,
} from "@/types/git";
import { toast } from "sonner";

export default function HomePage() {
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [workingFilePath, setWorkingFilePath] = useState("");
  const [workingNewContent, setWorkingNewContent] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [author, setAuthor] = useState("");
  const [branchName, setBranchName] = useState("");
  const [checkoutName, setCheckoutName] = useState("");
  const [deleteBranchName, setDeleteBranchName] = useState("");
  const [sha1, setSha1] = useState("");
  const [sha2, setSha2] = useState("");
  const [diffFile, setDiffFile] = useState("");
  const [mergeBranch, setMergeBranch] = useState("");
  const [isRepoInitialized, setIsRepoInitialized] = useState(false);
  const [intentSha, setIntentSha] = useState("");
  const [prophetBranch1, setProphetBranch1] = useState("");
  const [prophetBranch2, setProphetBranch2] = useState("");
  const [queryBranch, setQueryBranch] = useState("");
  const [queryText, setQueryText] = useState("");

  const [diffData, setDiffData] = useState<DiffLine[] | null>(null);
  const [workingDiffData, setWorkingDiffData] = useState<DiffLine[] | null>(null);
  const [mergePreviewData, setMergePreviewData] = useState<MergePreview | null>(null);
  const [aiDiffData, setAiDiffData] = useState<AiSemanticDiff | null>(null);
  const [intentData, setIntentData] = useState<CommitIntentResult | null>(null);
  const [prophecyData, setProphecyData] = useState<ProphecyReport | null>(null);
  const [trajectoryData, setTrajectoryData] = useState<TrajectoryResponse | null>(null);
  const [quickRiskScore, setQuickRiskScore] = useState<number | null>(null);
  const [queryData, setQueryData] = useState<QueryResult | null>(null);

  const { data: branches, loading: loadingBranches, error: branchError, refetch: refetchBranches } = useApiQuery(
    gitService.listBranches,
  );
  const { data: commits, loading: loadingLog, refetch: refetchLog } = useApiQuery(gitService.getLog);
  const { data: graph, refetch: refetchGraph } = useApiQuery(gitService.getCommitGraph);

  const initMutation = useApiMutation<void, unknown>(() => gitService.initRepository(), "Repository initialized");
  const addMutation = useApiMutation<{ path: string; content: string }, unknown>(
    (payload) => gitService.addFile(payload.path, payload.content),
    "File added",
  );
  const commitMutation = useApiMutation<{ message: string; author: string }, unknown>(
    (payload) => gitService.commitChanges(payload.message, payload.author),
    "Changes committed",
  );
  const createBranchMutation = useApiMutation<{ name: string }, unknown>(
    (payload) => gitService.createBranch(payload.name),
    "Branch created",
  );
  const deleteBranchMutation = useApiMutation<{ name: string }, unknown>(
    (payload) => gitService.deleteBranch(payload.name),
    "Branch deleted",
  );
  const checkoutMutation = useApiMutation<{ name: string }, unknown>(
    (payload) => gitService.checkoutBranch(payload.name),
    "Branch checked out",
  );
  const mergeMutation = useApiMutation<{ branch: string }, unknown>(
    (payload) => gitService.mergeBranch(payload.branch),
    "Branch merged",
  );

  const currentBranch = useMemo(() => {
    if (!branches?.length) return "Unknown";

    const branch = checkoutName || branches[0];

    if (typeof branch === "string") {
      return branch;
    }

    return branch?.name || "Unknown";
  }, [branches, checkoutName]);

  const onAddFile = async (e: FormEvent) => {
    e.preventDefault();
    if (!filePath.trim() || !fileContent.trim()) {
      toast.error("Path and content are required.");
      return;
    }
    await addMutation.mutate({ path: filePath, content: fileContent });
  };

  const onCommit = async (e: FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim() || !author.trim()) {
      toast.error("Commit message and author are required.");
      return;
    }
    await commitMutation.mutate({ message: commitMessage, author });
    await Promise.all([refetchLog(), refetchGraph()]);
  };

  const runDiff = async () => {
    if (!sha1.trim() || !sha2.trim() || !diffFile.trim()) {
      toast.error("sha1, sha2, and file are required for diff.");
      return;
    }
    try {
      setDiffData(await gitService.getDiff(sha1.trim(), sha2.trim(), diffFile.trim()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load diff.");
    }
  };

  const runWorkingDiff = async () => {
    if (!workingFilePath.trim() || !workingNewContent.trim()) {
      toast.error("file and newContent are required for working diff.");
      return;
    }
    try {
      setWorkingDiffData(await gitService.getWorkingDiff(workingFilePath.trim(), workingNewContent));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load working diff.");
    }
  };

  const runMergePreview = async () => {
    if (!mergeBranch.trim()) {
      toast.error("branch is required for merge preview.");
      return;
    }
    try {
      setMergePreviewData(await gitService.getMergePreview(mergeBranch.trim()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load merge preview.");
    }
  };

  const runAiDiff = async () => {
    if (!sha1.trim() || !sha2.trim() || !diffFile.trim()) {
      toast.error("sha1, sha2, and file are required for AI semantic diff.");
      return;
    }
    try {
      setAiDiffData(await gitService.getAiSemanticDiff(sha1.trim(), sha2.trim(), diffFile.trim()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load AI diff.");
    }
  };

  const runIntent = async () => {
    if (!intentSha.trim()) {
      toast.error("sha1 is required for intent analysis.");
      return;
    }
    try {
      setIntentData(await gitService.getAiIntent(intentSha.trim()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load intent analysis.");
    }
  };

  const runProphecy = async () => {
    if (!prophetBranch1.trim() || !prophetBranch2.trim()) {
      toast.error("Both branch names are required for conflict prophecy.");
      return;
    }
    try {
      const [report, trajectory, score] = await Promise.all([
        gitService.getAiProphecy(prophetBranch1.trim(), prophetBranch2.trim()),
        gitService.getAiProphecyTrajectory(prophetBranch1.trim(), prophetBranch2.trim()),
        gitService.getAiProphecyQuickScore(prophetBranch1.trim(), prophetBranch2.trim()),
      ]);
      setProphecyData(report);
      setTrajectoryData(trajectory);
      setQuickRiskScore(typeof score === "number" ? score : null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load conflict prophecy.");
    }
  };

  const runCodebaseQuery = async () => {
    if (!queryBranch.trim() || !queryText.trim()) {
      toast.error("Branch and question are required for codebase chat.");
      return;
    }
    try {
      setQueryData(await gitService.queryCodebaseMemory(queryBranch.trim(), queryText.trim()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to query codebase memory.");
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-[1400px] px-4 py-6 md:px-6">
      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        <Sidebar />
        <section className="space-y-6">
          <motion.div id="dashboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="grid gap-4 p-5 md:grid-cols-4">
              <div>
                <p className="text-xs uppercase text-slate-500">Repository</p>
                <p className="text-sm text-slate-100">Fissure AI Git Workspace</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Current Branch</p>
                <p className="text-sm text-slate-100">
                  {currentBranch}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Recent Commits</p>
                <p className="text-sm text-slate-100">{commits?.length ?? 0}</p>
              </div>
              <div>
                <Button
                  disabled={initMutation.loading || isRepoInitialized}
                  onClick={async () => {
                    const result = await initMutation.mutate(undefined);
                    if (result) {
                      setIsRepoInitialized(true);
                    }
                  }}
                >
                  {isRepoInitialized ? "Repository Initialized" : "Initialize Repository"}
                </Button>
              </div>
            </Card>
          </motion.div>

          <motion.section id="repository" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-100">Add File</h2>
              <form className="space-y-3" onSubmit={onAddFile}>
                <Input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="path/to/file.ts" required />
                <Textarea value={fileContent} onChange={(e) => setFileContent(e.target.value)} placeholder="File content..." required />
                <Button type="submit" disabled={addMutation.loading}>Submit</Button>
              </form>
            </Card>
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-100">Commit Changes</h2>
              <form className="space-y-3" onSubmit={onCommit}>
                <Input value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Commit message" required />
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author" required />
                <Button type="submit" disabled={commitMutation.loading}>Commit</Button>
              </form>
            </Card>
          </motion.section>

          <section id="commits" className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-100">Branch Management</h2>
              <div className="mb-4 space-y-2">
                <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="new-branch" />
                <Button
                  onClick={() => {
                    if (!branchName.trim()) {
                      toast.error("Branch name is required.");
                      return;
                    }
                    void createBranchMutation.mutate({ name: branchName.trim() }).then(refetchBranches);
                  }}
                  size="sm"
                >
                  Create
                </Button>
              </div>
              <div className="mb-4 space-y-2">
                <Input value={checkoutName} onChange={(e) => setCheckoutName(e.target.value)} placeholder="branch-to-checkout" />
                <Button
                  onClick={() => {
                    if (!checkoutName.trim()) {
                      toast.error("Target branch is required.");
                      return;
                    }
                    void checkoutMutation.mutate({ name: checkoutName.trim() }).then(refetchBranches);
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Checkout
                </Button>
              </div>
              <div className="space-y-2">
                <Input value={deleteBranchName} onChange={(e) => setDeleteBranchName(e.target.value)} placeholder="branch-to-delete" />
                <Button
                  onClick={() => {
                    if (!deleteBranchName.trim()) {
                      toast.error("Branch name is required.");
                      return;
                    }
                    void deleteBranchMutation.mutate({ name: deleteBranchName.trim() }).then(refetchBranches);
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Delete
                </Button>
              </div>
              <div className="mt-4">
                {loadingBranches && <LoadingState label="Fetching branches..." />}
                {branchError && <ErrorState message={branchError} />}
                {!loadingBranches && !branchError && (
                  <div className="space-y-2">
                    {branches?.map((branch, index) => (
                        <div
                            key={typeof branch === "string" ? branch : branch?.name || index}
                            className="rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-300"
                        >
                          {typeof branch === "string" ? branch : branch?.name}
                        </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
            {loadingLog ? <LoadingState label="Loading commits..." /> : <LogTimeline commits={commits ?? null} />}
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <GraphPreview graph={graph ?? null} />
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">Merge Preview</h2>
              {!mergePreviewData ? (
                <EmptyState label="Run merge preview to inspect conflicts." />
              ) : (
                <div className="space-y-2 text-sm text-slate-300">
                  <p>Status: {mergePreviewData.cleanMerge ? "Clean merge" : "Conflicts detected"}</p>
                  {!!mergePreviewData.detail && <p className="rounded-md border border-amber-900/50 bg-amber-950/20 p-2">{mergePreviewData.detail}</p>}
                </div>
              )}
              <div className="mt-4 space-y-2">
                <Input value={mergeBranch} onChange={(e) => setMergeBranch(e.target.value)} placeholder="branch to merge into current branch" />
                <Button onClick={() => void runMergePreview()} variant="secondary">Preview Merge</Button>
                <ActionModal
                  title="Merge Branches"
                  description="This will execute the merge operation against your backend repository."
                  onConfirm={() => {
                    if (!mergeBranch.trim()) {
                      toast.error("branch is required for merge.");
                      return;
                    }
                    void mergeMutation.mutate({ branch: mergeBranch.trim() }).then(runMergePreview);
                  }}
                  trigger={<Button>Merge Branch</Button>}
                />
              </div>
            </Card>
          </section>

          <section id="diff" className="grid gap-6">
            <Card className="p-5 space-y-2">
              <h2 className="text-sm font-semibold text-slate-100">Diff Inputs</h2>
              <Input value={sha1} onChange={(e) => setSha1(e.target.value)} placeholder="sha1" />
              <Input value={sha2} onChange={(e) => setSha2(e.target.value)} placeholder="sha2" />
              <Input value={diffFile} onChange={(e) => setDiffFile(e.target.value)} placeholder="file path" />
              <div className="flex gap-2">
                <Button onClick={() => void runDiff()}>Run Commit Diff</Button>
                <Button variant="secondary" onClick={() => void runAiDiff()}>Run AI Diff</Button>
              </div>
            </Card>
            <DiffViewer lines={diffData} title="Diff Viewer (/git/diff)" />
            <Card className="p-5 space-y-2">
              <h2 className="text-sm font-semibold text-slate-100">Working Diff Inputs</h2>
              <Input value={workingFilePath} onChange={(e) => setWorkingFilePath(e.target.value)} placeholder="file path" />
              <Textarea value={workingNewContent} onChange={(e) => setWorkingNewContent(e.target.value)} placeholder="new content" />
              <Button onClick={() => void runWorkingDiff()}>Run Working Diff</Button>
            </Card>
            <DiffViewer lines={workingDiffData} title="Working Diff (/git/diff/working)" />
          </section>

          <section id="ai">
            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="p-5 space-y-2">
                <h2 className="text-sm font-semibold text-slate-100">AI Semantic Diff</h2>
                <Input value={sha1} onChange={(e) => setSha1(e.target.value)} placeholder="sha1" />
                <Input value={sha2} onChange={(e) => setSha2(e.target.value)} placeholder="sha2" />
                <Input value={diffFile} onChange={(e) => setDiffFile(e.target.value)} placeholder="file path" />
                <Button onClick={() => void runAiDiff()}>Run Semantic Diff</Button>
              </Card>

              <Card className="p-5 space-y-2">
                <h2 className="text-sm font-semibold text-slate-100">AI Commit Intent</h2>
                <Input value={intentSha} onChange={(e) => setIntentSha(e.target.value)} placeholder="commit sha1" />
                <Button onClick={() => void runIntent()}>Run Intent</Button>
              </Card>
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <SemanticCard data={aiDiffData} />
              <IntentCard data={intentData} />
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <Card className="p-5 space-y-2">
                <h2 className="text-sm font-semibold text-slate-100">AI Conflict Risk + Bug Detector Signals</h2>
                <Input value={prophetBranch1} onChange={(e) => setProphetBranch1(e.target.value)} placeholder="branch1" />
                <Input value={prophetBranch2} onChange={(e) => setProphetBranch2(e.target.value)} placeholder="branch2" />
                <Button onClick={() => void runProphecy()}>Run Conflict Prediction</Button>
              </Card>
              <Card className="p-5 space-y-2">
                <h2 className="text-sm font-semibold text-slate-100">CodebaseMemory Chat</h2>
                <Input value={queryBranch} onChange={(e) => setQueryBranch(e.target.value)} placeholder="branch name" />
                <Textarea value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Ask a codebase question..." />
                <Button onClick={() => void runCodebaseQuery()}>Ask</Button>
              </Card>
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ProphecyCard report={prophecyData} trajectory={trajectoryData} quickScore={quickRiskScore} />
              <CodebaseChatCard data={queryData} />
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
