SELECT 'Bet' as tbl, COUNT(*) FROM "Bet"
UNION ALL SELECT 'Score', COUNT(*) FROM "Score"
UNION ALL SELECT 'Market', COUNT(*) FROM "Market"
UNION ALL SELECT 'Wallet', COUNT(*) FROM "Wallet";
