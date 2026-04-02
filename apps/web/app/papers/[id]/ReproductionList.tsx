"use client";

import { useState } from "react";
import Link from "next/link";
import type { Reproduction, ReproductionResult } from "@codepawl/shared";
import {
  CheckCircleFill,
  ExclamationTriangleFill,
  XCircleFill,
  QuestionCircleFill,
  Github,
  ChevronDown,
  ChevronUp,
  CaretUpFill,
  CaretDownFill,
} from "react-bootstrap-icons";
import { vote } from "app/lib/community";
import { createClient } from "app/lib/supabase/client";

const RESULT_CONFIG: Record<ReproductionResult, { label: string; className: string; Icon: typeof CheckCircleFill }> = {
  confirmed: {
    label: "Confirmed",
    className: "bg-green-500/20 text-green-600 dark:text-green-400",
    Icon: CheckCircleFill,
  },
  partially: {
    label: "Partially Reproduced",
    className: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    Icon: ExclamationTriangleFill,
  },
  failed: {
    label: "Failed to Reproduce",
    className: "bg-red-500/20 text-red-600 dark:text-red-400",
    Icon: XCircleFill,
  },
  different_findings: {
    label: "Different Findings",
    className: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    Icon: QuestionCircleFill,
  },
};

interface ReproductionListProps {
  reproductions: Reproduction[];
  paperId: string;
}

export function ReproductionList({ reproductions, paperId }: ReproductionListProps) {
  if (reproductions.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500 border-t border-neutral-200 dark:border-neutral-800">
        <p className="mb-2">No reproductions yet.</p>
        <Link
          href={`/papers/${paperId}/reproduce`}
          className="text-sm font-medium text-neutral-900 dark:text-neutral-100 underline"
        >
          Be the first to submit one
        </Link>
      </div>
    );
  }

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
        Reproductions ({reproductions.length})
      </h2>
      <div className="space-y-4">
        {reproductions.map((repro) => (
          <ReproductionCard key={repro.id} reproduction={repro} />
        ))}
      </div>
    </div>
  );
}

function ReproductionCard({ reproduction }: { reproduction: Reproduction }) {
  const [expanded, setExpanded] = useState(false);
  const [score, setScore] = useState(reproduction.score);
  const [userVote, setUserVote] = useState(0);

  const config = RESULT_CONFIG[reproduction.result] || RESULT_CONFIG.confirmed;
  const { Icon } = config;

  const handleVote = async (value: number) => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const newValue = userVote === value ? 0 : value;
      const result = await vote(session.access_token, {
        target_id: reproduction.id,
        target_type: "reproduction",
        value: newValue,
      });
      setScore(result.score);
      setUserVote(result.user_vote);
    } catch {
      // silent
    }
  };

  const hasClaims =
    reproduction.paper_claims.length > 0 && reproduction.actual_results.length > 0;

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="flex gap-3">
        {/* Vote arrows */}
        <div className="flex flex-col items-center gap-0.5 pt-1">
          <button
            onClick={() => handleVote(1)}
            className={`p-1 rounded transition-colors cursor-pointer bg-transparent border-none ${
              userVote === 1 ? "text-green-500" : "text-neutral-400 hover:text-neutral-600"
            }`}
          >
            <CaretUpFill size={14} />
          </button>
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{score}</span>
          <button
            onClick={() => handleVote(-1)}
            className={`p-1 rounded transition-colors cursor-pointer bg-transparent border-none ${
              userVote === -1 ? "text-red-500" : "text-neutral-400 hover:text-neutral-600"
            }`}
          >
            <CaretDownFill size={14} />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
              <Icon size={10} />
              {config.label}
            </span>
            <div className="flex items-center gap-1.5">
              {reproduction.author.avatar_url ? (
                <img src={reproduction.author.avatar_url} alt="" className="w-5 h-5 rounded-full" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-500">
                  {reproduction.author.username[0]?.toUpperCase()}
                </div>
              )}
              <Link
                href={`/profile/${reproduction.author.username}`}
                className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 no-underline"
              >
                {reproduction.author.display_name || reproduction.author.username}
              </Link>
            </div>
            <span className="text-xs text-neutral-400">
              {new Date(reproduction.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>

          {/* Pills */}
          <div className="flex gap-1.5 flex-wrap mb-2">
            {reproduction.hardware && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 dark:bg-neutral-700 text-neutral-200">
                {reproduction.hardware}
              </span>
            )}
            {reproduction.framework && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 dark:bg-neutral-700 text-neutral-200">
                {reproduction.framework}
              </span>
            )}
            {reproduction.model_tested && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 dark:bg-neutral-700 text-neutral-200">
                {reproduction.model_tested}
              </span>
            )}
          </div>

          {/* Summary */}
          <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-2">
            {reproduction.summary}
          </p>

          {/* Claims comparison table */}
          {hasClaims && (
            <div className="overflow-x-auto mb-2">
              <table className="w-full text-xs border border-neutral-200 dark:border-neutral-700 rounded">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-neutral-900">
                    <th className="text-left px-3 py-1.5 font-medium text-neutral-500">Metric</th>
                    <th className="text-left px-3 py-1.5 font-medium text-neutral-500">Paper claims</th>
                    <th className="text-left px-3 py-1.5 font-medium text-neutral-500">Actual result</th>
                  </tr>
                </thead>
                <tbody>
                  {reproduction.paper_claims.map((claim, i) => {
                    const actual = reproduction.actual_results[i] || {};
                    const claimName = Object.keys(claim)[0] || "";
                    const claimValue = claim[claimName] || "";
                    const actualValue = actual[claimName] || "";
                    const match = claimValue === actualValue;
                    return (
                      <tr key={i} className="border-t border-neutral-200 dark:border-neutral-700">
                        <td className="px-3 py-1.5 font-medium text-neutral-700 dark:text-neutral-300">{claimName}</td>
                        <td className="px-3 py-1.5 text-neutral-600 dark:text-neutral-400">{claimValue}</td>
                        <td className={`px-3 py-1.5 font-medium ${match ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {actualValue}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            {reproduction.code_url && (
              <a
                href={reproduction.code_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 no-underline"
              >
                <Github size={12} />
                Code
              </a>
            )}
            {reproduction.details && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer bg-transparent border-none"
              >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {expanded ? "Hide full report" : "Read full report"}
              </button>
            )}
          </div>

          {/* Expanded details */}
          {expanded && reproduction.details && (
            <div className="mt-3 p-3 rounded-md bg-neutral-50 dark:bg-neutral-900 text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
              {reproduction.details}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
