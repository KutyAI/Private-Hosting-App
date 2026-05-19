export interface MetricValue {
  labels: Record<string, string>;
  value: number;
}

export interface ParsedMetric {
  name: string;
  help?: string;
  type?: string;
  values: MetricValue[];
}

export type ParsedMetricsMap = Record<string, ParsedMetric>;

/**
 * Parses a standard Prometheus text exposition string into a structured JSON map.
 */
export function parsePrometheusMetrics(text: string): ParsedMetricsMap {
  const lines = text.split('\n');
  const metrics: ParsedMetricsMap = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1. Parse HELP lines
    if (trimmed.startsWith('# HELP ')) {
      const parts = trimmed.substring(7).split(' ');
      const name = parts[0];
      const help = parts.slice(1).join(' ');
      if (!metrics[name]) {
        metrics[name] = { name, values: [] };
      }
      metrics[name].help = help;
      continue;
    }

    // 2. Parse TYPE lines
    if (trimmed.startsWith('# TYPE ')) {
      const parts = trimmed.substring(7).split(' ');
      const name = parts[0];
      const type = parts[1];
      if (!metrics[name]) {
        metrics[name] = { name, values: [] };
      }
      metrics[name].type = type;
      continue;
    }

    // Skip other comment lines
    if (trimmed.startsWith('#')) continue;

    // 3. Parse Metric value lines: metric_name{label1="val1",...} value OR metric_name value
    const braceIndex = trimmed.indexOf('{');
    let name = '';
    const labels: Record<string, string> = {};
    let valueStr = '';

    if (braceIndex > 0) {
      name = trimmed.substring(0, braceIndex).trim();
      const endBraceIndex = trimmed.indexOf('}', braceIndex);
      if (endBraceIndex > 0) {
        const labelsStr = trimmed.substring(braceIndex + 1, endBraceIndex);
        valueStr = trimmed.substring(endBraceIndex + 1).trim();

        // Parse comma-separated label pairs, considering potential quotes
        // Split by comma only if it's not inside quotes
        const labelParts = labelsStr.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        for (const part of labelParts) {
          const eqIndex = part.indexOf('=');
          if (eqIndex > 0) {
            const key = part.substring(0, eqIndex).trim();
            let val = part.substring(eqIndex + 1).trim();
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.substring(1, val.length - 1);
            }
            labels[key] = val;
          }
        }
      }
    } else {
      const spaceIndex = trimmed.lastIndexOf(' ');
      if (spaceIndex > 0) {
        name = trimmed.substring(0, spaceIndex).trim();
        valueStr = trimmed.substring(spaceIndex + 1).trim();
      } else {
        name = trimmed;
        valueStr = '';
      }
    }

    if (name) {
      const value = parseFloat(valueStr);
      if (!isNaN(value)) {
        if (!metrics[name]) {
          metrics[name] = { name, values: [] };
        }
        metrics[name].values.push({ labels, value });
      }
    }
  }

  return metrics;
}

/**
 * Convenience helper to extract a single number value from parsed metrics map.
 * Returns a fallback value if metric or label path doesn't exist.
 */
export function getMetricValue(
  metrics: ParsedMetricsMap,
  metricName: string,
  labelsFilter?: Record<string, string>,
  fallback = 0
): number {
  const metric = metrics[metricName];
  if (!metric || metric.values.length === 0) return fallback;

  if (!labelsFilter) {
    return metric.values[0].value;
  }

  // Find first value matching all filters
  const match = metric.values.find((val) => {
    return Object.entries(labelsFilter).every(([key, expected]) => {
      return val.labels[key] === expected;
    });
  });

  return match ? match.value : fallback;
}
