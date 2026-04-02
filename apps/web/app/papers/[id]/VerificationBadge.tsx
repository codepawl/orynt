import type { VerificationStatus } from "@codepawl/shared";
import { CheckCircleFill, ExclamationTriangleFill, QuestionCircleFill } from "react-bootstrap-icons";

const STATUS_CONFIG: Record<VerificationStatus, { label: string; className: string; Icon: typeof CheckCircleFill }> = {
  verified: {
    label: "Verified",
    className: "bg-green-500/20 text-green-600 dark:text-green-400",
    Icon: CheckCircleFill,
  },
  partially_reproduced: {
    label: "Partially Reproduced",
    className: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
    Icon: ExclamationTriangleFill,
  },
  disputed: {
    label: "Disputed",
    className: "bg-red-500/20 text-red-600 dark:text-red-400",
    Icon: ExclamationTriangleFill,
  },
  unverified: {
    label: "Unverified",
    className: "bg-neutral-500/20 text-neutral-500 dark:text-neutral-400",
    Icon: QuestionCircleFill,
  },
};

export function VerificationBadge({
  status,
  size = "sm",
}: {
  status: VerificationStatus;
  size?: "sm" | "lg";
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unverified;
  const { Icon } = config;

  if (size === "lg") {
    return (
      <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${config.className}`}>
        <Icon size={16} />
        {config.label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      <Icon size={10} />
      {config.label}
    </span>
  );
}
