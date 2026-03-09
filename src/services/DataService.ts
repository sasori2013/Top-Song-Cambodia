export const fetchData = async () => {
  const defaultData = {
    totalProduction: 0,
    totalArtist: 0,
    totalTracks: 0,
    totalEntries: 0
  };

  try {
    const response = await fetch('/api/admin/sheet');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Data fetch error:", error);
    return defaultData;
  }
};
