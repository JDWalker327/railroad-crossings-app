/**
 * railroad-name-map.js
 *
 * Starter mapping of NTAD RAILROAD abbreviations to full railroad names.
 *
 * The keys come from the RAILROAD column in the NTAD CSV.
 * Well-known Class I railroads and major transit authorities are pre-filled.
 * All other entries need to be filled in manually after research.
 *
 * To look up an abbreviation:
 *   - Search the STB (Surface Transportation Board) carrier list
 *   - Search the FRA Office of Railroad Safety railroad list
 *   - Search the abbreviation + "railroad" or "railway" in a web search
 *
 * Run the helper to get the full abbreviation list with row counts:
 *   node export-railroad-abbreviations.js "path/to/NTAD.csv"
 */

const railroadNameMap = {
  // Class I railroads
  BNSF: "BNSF Railway",
  CN: "Canadian National Railway",
  CP: "Canadian Pacific Railway",
  CPKC: "CPKC (Canadian Pacific Kansas City)",
  CSX: "CSX Transportation",
  IC: "Illinois Central Railroad",
  KCS: "Kansas City Southern Railway",
  NS: "Norfolk Southern Railway",
  SOO: "Soo Line Railroad",
  UP: "Union Pacific Railroad",

  // Major commuter / transit
  DART: "Dallas Area Rapid Transit",
  GTW: "Grand Trunk Western Railroad",
  LIRR: "Long Island Rail Road",
  MBTA: "Massachusetts Bay Transportation Authority",
  NJTR: "NJ Transit Rail Operations",
  PATH: "Port Authority Trans-Hudson",

  // Other well-known railroads
  DME: "Dakota, Minnesota & Eastern Railroad",
  FEC: "Florida East Coast Railway",
  WC: "Wisconsin Central Ltd",

  // Add more entries here as you research each abbreviation.
  // Example:
  //   ATN: "Full Railroad Name Here",
};

module.exports = railroadNameMap;
