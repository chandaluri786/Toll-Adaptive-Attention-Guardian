// OWNER: A (Spec A, tasks A11, A13). The connected Forecast tab: asks the ledger for as much history as
// the chosen range needs (the range plus the period it is compared with), builds the model, draws it.
import React, { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import services from '../../services';
import { forecastModel, historyNeeded, type Range } from '../forecast';
import { ForecastView } from './ForecastView';

export default function ForecastScreen() {
  const [range, setRange] = useState<Range>('week');
  const insets = useSafeAreaInsets();
  const model = useMemo(() => forecastModel(range, services.ledger.history(historyNeeded(range))), [range]);
  return <ForecastView model={model} range={range} onRange={setRange} topInset={insets.top} />;
}
