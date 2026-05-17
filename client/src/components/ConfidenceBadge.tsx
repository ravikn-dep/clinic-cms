import React from 'react';

interface ConfidenceBadgeProps {
  score?: number;
  showLabel?: boolean;
}

/**
 * Displays a color-coded confidence badge for PO extraction fields.
 * - Green (>90%): High confidence
 * - Yellow (70-90%): Medium confidence
 * - Red (<70%): Low confidence
 * - Gray: No confidence score available
 */
export function ConfidenceBadge({ score, showLabel = true }: ConfidenceBadgeProps) {
  if (score === undefined || score === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
        <span className="w-2 h-2 rounded-full bg-gray-400"></span>
        {showLabel && 'No data'}
      </span>
    );
  }

  const percentage = Math.round(score * 100);
  let bgColor = 'bg-gray-100';
  let textColor = 'text-gray-700';
  let dotColor = 'bg-gray-400';
  let label = 'Unknown';

  if (score > 0.9) {
    bgColor = 'bg-green-100';
    textColor = 'text-green-700';
    dotColor = 'bg-green-500';
    label = 'High';
  } else if (score >= 0.7) {
    bgColor = 'bg-yellow-100';
    textColor = 'text-yellow-700';
    dotColor = 'bg-yellow-500';
    label = 'Medium';
  } else {
    bgColor = 'bg-red-100';
    textColor = 'text-red-700';
    dotColor = 'bg-red-500';
    label = 'Low';
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${bgColor} ${textColor}`}>
      <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
      {showLabel ? `${label} (${percentage}%)` : `${percentage}%`}
    </span>
  );
}

/**
 * Tooltip helper for explaining confidence scores
 */
export function ConfidenceTooltip() {
  return (
    <div className="text-xs text-gray-600 mt-1 p-2 bg-gray-50 rounded border border-gray-200">
      <p className="font-semibold mb-1">Extraction Confidence:</p>
      <ul className="space-y-1">
        <li><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>High (&gt;90%): Reliable data</li>
        <li><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1"></span>Medium (70-90%): Review recommended</li>
        <li><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>Low (&lt;70%): Manual verification needed</li>
      </ul>
    </div>
  );
}
