
export interface Candle {
  Date: string;
  Time: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  timestamp: number;
}

export enum TradeType {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum MADirection {
  UP = '上彎',
  FLAT = '走平',
  DOWN = '下跌'
}

export interface MATrend {
  period: number;
  direction: MADirection;
}

export interface Trade {
  id: string;
  timestamp: number;
  date: string;
  time: string;
  type: TradeType;
  price: number;
  quantity: number;
  maTrends: MATrend[];
}

export interface TradeRecord {
  id: string;
  date: string;
  time: string;
  type: TradeType;
  quantity: number;
  maTrends: MATrend[];
  profit: number | null;
  totalBalance: number;
}
