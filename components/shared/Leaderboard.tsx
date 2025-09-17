import React, { useState, useEffect } from 'react';
import { Trophy, Fuel, Route, Bolt } from 'lucide-react';
import Card from './Card';
import Header from './Header';
import { LeaderboardEntry } from '../../types';
import api from '../../services/mockApi';

interface LeaderboardProps {
    onBack?: () => void;
    hideBackButton?: boolean;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ onBack, hideBackButton }) => {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const data = await api.getLeaderboard();
      setLeaderboardData(data);
      setLoading(false);
    };
    fetchData();
  }, []);
  
  const rankColor = (rank: number) => {
      if (rank === 0) return "text-yellow-400";
      if (rank === 1) return "text-gray-400";
      if (rank === 2) return "text-yellow-600";
      return "text-gray-600";
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header title="Driver Leaderboard" />
      <main className="max-w-4xl mx-auto p-6">
        <Card>
          <div className="flex items-center mb-6">
            <Trophy className="h-10 w-10 text-yellow-500 mr-4" />
            <div>
                <h2 className="text-3xl font-bold text-gray-800">Top Performers</h2>
                <p className="text-gray-500">Ranked by total distance driven</p>
            </div>
          </div>
          
          {onBack && !hideBackButton && <button onClick={onBack} className="mb-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Back to Dashboard</button>}

          {loading ? (
            <p>Loading leaderboard...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg. Efficiency</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total km Driven</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leaderboardData.map((entry, index) => (
                    <tr key={entry.driver.id} className={index < 3 ? 'bg-yellow-50' : ''}>
                      <td className={`px-6 py-4 whitespace-nowrap text-lg font-bold ${rankColor(index)}`}>{index + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{entry.driver.firstName} {entry.driver.surname}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold flex items-center">
                        {entry.averageKmL && (
                            <>
                                <Fuel className="h-4 w-4 mr-2" />
                                {entry.averageKmL.toFixed(2)} km/L
                            </>
                        )}
                        {entry.averageKmPerKwh && (
                            <>
                                <Bolt className="h-4 w-4 mr-2" />
                                {entry.averageKmPerKwh.toFixed(2)} km/kWh
                            </>
                        )}
                        {!entry.averageKmL && !entry.averageKmPerKwh && (
                            <span>N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center">
                        <Route className="h-4 w-4 mr-2" />
                        {entry.totalKmDriven.toLocaleString()} km
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default Leaderboard;
