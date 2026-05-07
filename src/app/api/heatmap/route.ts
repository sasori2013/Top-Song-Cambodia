import { NextResponse } from 'next/server';

// Province popularity data from area-based artist search.
// Values are relative interest (0-100). Replace with real API
// (e.g. Google Trends geoMap, Spotify market data) as needed.
// Amplification is handled client-side when the range is flat.
const MOCK_DATA: { id: string; value: number }[] = [
  { id: 'phnom_penh',       value: 100 },
  { id: 'siem_reap',        value: 82  },
  { id: 'kandal',           value: 75  },
  { id: 'battambang',       value: 70  },
  { id: 'kampong_cham',     value: 68  },
  { id: 'prey_veng',        value: 62  },
  { id: 'kratie',           value: 60  },
  { id: 'kampong_thom',     value: 58  },
  { id: 'takeo',            value: 58  },
  { id: 'kampong_chhnang',  value: 55  },
  { id: 'tbong_khmum',      value: 55  },
  { id: 'preah_sihanouk',   value: 55  },
  { id: 'kampong_speu',     value: 52  },
  { id: 'svay_rieng',       value: 50  },
  { id: 'kampot',           value: 50  },
  { id: 'pursat',           value: 48  },
  { id: 'banteay_meanchey', value: 45  },
  { id: 'kep',              value: 38  },
  { id: 'oddar_meanchey',   value: 38  },
  { id: 'preah_vihear',     value: 35  },
  { id: 'stung_treng',      value: 32  },
  { id: 'pailin',           value: 28  },
  { id: 'koh_kong',         value: 28  },
  { id: 'mondulkiri',       value: 22  },
  { id: 'ratanakiri',       value: 18  },
];

export async function GET() {
  return NextResponse.json({
    artist: 'Khmer Artist',
    date: new Date().toISOString().split('T')[0],
    provinces: MOCK_DATA,
  });
}
