export function formatDate(date: string, includeRelative = false) {
  let currentDate = new Date();
  if (!date.includes("T")) {
    date = `${date}T00:00:00`;
  }
  let targetDate = new Date(date);

  let yearsAgo = currentDate.getFullYear() - targetDate.getFullYear();
  let monthsAgo = currentDate.getMonth() - targetDate.getMonth();
  let daysAgo = currentDate.getDate() - targetDate.getDate();

  let formattedDate = "";

  if (yearsAgo > 0) {
    formattedDate = `${yearsAgo}y ago`;
  } else if (monthsAgo > 0) {
    formattedDate = `${monthsAgo}mo ago`;
  } else if (daysAgo > 0) {
    formattedDate = `${daysAgo}d ago`;
  } else {
    formattedDate = "Today";
  }

  let fullDate = targetDate.toLocaleString("en-us", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (!includeRelative) {
    return fullDate;
  }

  return `${fullDate} (${formattedDate})`;
}

export function estimateReadingTimeMinutes(
  content: string,
  wordsPerMinute = 200
): number {
  if (!content) {
    return 1;
  }

  const plainText = content.replace(/[`*_#>\-\+\d\.![\](){}]/g, " ");
  const words = plainText
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return 1;
  }

  return Math.max(1, Math.round(words.length / wordsPerMinute));
}
