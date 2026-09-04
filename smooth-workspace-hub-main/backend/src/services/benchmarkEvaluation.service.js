function sameIds(left = [], right = []) {
  return [...left].sort().join('|') === [...right].sort().join('|');
}

function evaluateBenchmark(results, groundTruth) {
  const items = Object.entries(groundTruth || {});
  let correctMatches = 0; let wrongMatches = 0; let correctUnmatched = 0; let missedMatches = 0;
  const differences = [];
  for (const [invoiceId, expected] of items) {
    const actual = results.find((item) => item.invoiceId === invoiceId) || {};
    const predictedIds = actual.transactionIds || (actual.transactionId ? [actual.transactionId] : []);
    const expectedIds = expected.transaction_ids || expected.expected_transaction_ids || expected.transactionIds || [];
    const expectedMatch = expectedIds.length > 0;
    if (expectedMatch && predictedIds.length && sameIds(predictedIds, expectedIds)) correctMatches++;
    else if (expectedMatch && predictedIds.length) { wrongMatches++; differences.push({ invoiceId, type: 'WRONG_MATCH', expected: expectedIds, predicted: predictedIds }); }
    else if (expectedMatch) { missedMatches++; differences.push({ invoiceId, type: 'MISSED_MATCH', expected: expectedIds, predicted: [] }); }
    else if (!predictedIds.length) correctUnmatched++;
    else { wrongMatches++; differences.push({ invoiceId, type: 'FALSE_POSITIVE_MATCH', expected: [], predicted: predictedIds }); }
  }
  const predictedMatches = correctMatches + wrongMatches;
  const expectedMatches = items.filter(([, item]) => (item.transaction_ids || item.expected_transaction_ids || item.transactionIds || []).length > 0).length;
  const precision = predictedMatches ? correctMatches / predictedMatches : 0;
  const recall = expectedMatches ? correctMatches / expectedMatches : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { correct_matches: correctMatches, wrong_matches: wrongMatches, correct_unmatched: correctUnmatched, missed_matches: missedMatches, false_positive_matches: differences.filter((item) => item.type === 'FALSE_POSITIVE_MATCH').length, false_negative_matches: missedMatches, precision, recall, f1, overall_correctness: items.length ? (correctMatches + correctUnmatched) / items.length : 0, differences };
}

module.exports = { evaluateBenchmark, sameIds };
