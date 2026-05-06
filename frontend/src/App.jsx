import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { CheckCircle, Edit2, Download } from 'lucide-react';

function App() {
  const [entries, setEntries] = useState([]);

  // 1. Stable fetch function to prevent cascading renders
  const fetchEntries = useCallback(async (isMounted = true) => {
    try {
      const response = await axios.get('http://localhost:5000/api/entries');
      if (isMounted) {
        setEntries(response.data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, []);

  // 2. Lifecycle management with polling and cleanup
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      await fetchEntries(isMounted);
    };

    loadData();

    const interval = setInterval(() => {
      fetchEntries(isMounted);
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [fetchEntries]);

  // 3. Logic to update status to "Approved"
  const handleApprove = async (id) => {
    try {
      await axios.patch(`http://localhost:5000/api/entries/${id}`, { 
        status: 'Approved' 
      });
      fetchEntries(); // Refresh list
    } catch (error) {
      console.error("Error approving entry:", error);
    }
  };

  // 4. Logic to generate and download Billing CSV
  const exportToCSV = () => {
    const approvedEntries = entries.filter(e => e.status === 'Approved');

    if (approvedEntries.length === 0) {
      alert("Please approve some entries before exporting the billing report.");
      return;
    }

    const headers = ["Date", "Application", "Window Title", "Matter", "Duration (Sec)", "Status"];
    const rows = approvedEntries.map(e => [
      new Date(e.timestamp).toLocaleDateString(),
      `"${e.appName}"`, 
      `"${e.windowTitle}"`,
      `"${e.matter}"`,
      e.durationSeconds,
      e.status
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `AutoTime_Billing_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '40px', backgroundColor: '#121212', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '36px', margin: 0 }}>AutoTime Attorney Dashboard</h1>
          <p style={{ color: '#aaa', marginTop: '5px' }}>Review and approve automated time captures.</p>
        </div>
        
        <button 
          onClick={exportToCSV}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '12px 24px', 
            backgroundColor: '#4CAF50', 
            border: 'none', 
            borderRadius: '6px', 
            color: 'white', 
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#45a049'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#4CAF50'}
        >
          <Download size={20} /> Export Billing Report
        </button>
      </header>
      
      <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#1e1e1e', borderRadius: '8px', overflow: 'hidden' }}>
        <thead>
          <tr style={{ backgroundColor: '#2d2d2d', color: '#aaa', textAlign: 'left' }}>
            <th style={{ padding: '15px' }}>Application</th>
            <th style={{ padding: '15px' }}>Task/Window</th>
            <th style={{ padding: '15px' }}>Matter</th>
            <th style={{ padding: '15px' }}>Status</th>
            <th style={{ padding: '15px' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#555' }}>
                No activity detected yet. Ensure the Desktop Agent is running.
              </td>
            </tr>
          ) : (
            entries.map((entry) => (
              <tr key={entry._id} style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '15px' }}>{entry.appName}</td>
                <td style={{ padding: '15px' }}>{entry.windowTitle}</td>
                <td style={{ padding: '15px' }}>{entry.matter}</td>
                <td style={{ padding: '15px' }}>
                  <span style={{ 
                    color: entry.status === 'Approved' ? '#4CAF50' : '#FFC107',
                    fontWeight: 'bold',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: entry.status === 'Approved' ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 193, 7, 0.1)'
                  }}>
                    {entry.status}
                  </span>
                </td>
                <td style={{ padding: '15px' }}>
                  {entry.status !== 'Approved' && (
                    <button 
                      onClick={() => handleApprove(entry._id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '15px' }}
                      title="Approve Time Entry"
                    >
                      <CheckCircle size={22} color="#4CAF50" />
                    </button>
                  )}
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} title="Edit Details">
                    <Edit2 size={20} color="#aaa" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default App;