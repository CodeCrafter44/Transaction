// Importing required modules
const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

const cors = require('cors');
app.use(cors());


// Connect to MongoDB
// Connect to MongoDB without deprecated options
mongoose.connect('mongodb://localhost:27017/transactions')
    .then(() => console.log('Connected to database'))
    .catch(err => console.error('Could not connect to database:', err));


    app.get('/api/seed', async (req, res) => {
        try {
            const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
            const transactions = response.data;
    
            // Clear the existing data before seeding
            await Transaction.deleteMany({});
            
            // Seed the data
            await Transaction.insertMany(transactions);
            res.status(200).send('Database seeded successfully');
        } catch (error) {
            res.status(500).send('Error seeding the database');
        }
    });

    // API to list transactions with search and pagination
app.get('/api/transactions', async (req, res) => {
    const { month, search = '', page = 1, perPage = 10 } = req.query;

    // Check if 'month' parameter is provided
    if (!month) {
        return res.status(400).json({ message: "Month parameter is required" });
    }

    // Create a date range for the selected month
    const monthStart = new Date(`${month} 1, 2022`);  // Example: "March 1, 2022"
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);  // Move to the next month

    // Prepare the query
    const query = {
        dateOfSale: { $gte: monthStart, $lt: monthEnd },  // Match the month range
        $or: [  // Match search parameters
            { title: new RegExp(search, 'i') },
            { description: new RegExp(search, 'i') },
            { price: new RegExp(search, 'i') }
        ]
    };

    try {
        // Fetch transactions from the database based on the query, with pagination
        const transactions = await Transaction.find(query)
            .skip((page - 1) * parseInt(perPage))  // Skip records for pagination
            .limit(parseInt(perPage));  // Limit the number of records per page

        // Count total records matching the query
        const total = await Transaction.countDocuments(query);

        // Send the response
        res.json({ transactions, total, page: parseInt(page), perPage: parseInt(perPage) });
    } catch (error) {
        // Log the error and send a response with the error message
        console.error('Error fetching transactions:', error);
        res.status(500).json({ message: 'Error fetching transactions', error: error.message });
    }
});

    app.get('/api/statistics', async (req, res) => {
        const { month } = req.query;
    
        try {
            const statistics = await Transaction.aggregate([
                {
                    $match: { dateOfSale: { $regex: month, $options: 'i' } }
                },
                {
                    $group: {
                        _id: null,
                        totalSaleAmount: { $sum: '$price' },
                        totalSoldItems: { $sum: { $cond: [{ $eq: ['$sold', true] }, 1, 0] } },
                        totalNotSoldItems: { $sum: { $cond: [{ $eq: ['$sold', false] }, 1, 0] } }
                    }
                }
            ]);
    
            const result = statistics[0] || {
                totalSaleAmount: 0,
                totalSoldItems: 0,
                totalNotSoldItems: 0,
            };
    
            res.json(result);
        } catch (error) {
            res.status(500).send('Error fetching statistics');
        }
    });
    // API for bar chart (price ranges)
app.get('/api/bar-chart', async (req, res) => {
    const { month } = req.query;

    // Define price ranges
    const priceRanges = [
        { range: '0-100', min: 0, max: 100 },
        { range: '101-200', min: 101, max: 200 },
        { range: '201-300', min: 201, max: 300 },
        { range: '301-400', min: 301, max: 400 },
        { range: '401-500', min: 401, max: 500 },
        { range: '501-600', min: 501, max: 600 },
        { range: '601-700', min: 601, max: 700 },
        { range: '701-800', min: 701, max: 800 },
        { range: '801-900', min: 801, max: 900 },
        { range: '901-above', min: 901, max: Infinity }
    ];

    try {
        // Check if 'month' parameter is provided
        if (!month) {
            return res.status(400).json({ message: "Month parameter is required" });
        }

        // Process each price range and count items within the range for the given month
        const barChartData = await Promise.all(priceRanges.map(async (range) => {
            const count = await Transaction.countDocuments({
                dateOfSale: { $regex: month, $options: 'i' },
                price: { $gte: range.min, $lte: range.max }
            });
            return { range: range.range, count };
        }));

        // Return the bar chart data
        res.json(barChartData);
    } catch (error) {
        // Log the error and respond with an error message
        console.error('Error fetching bar chart data:', error);
        res.status(500).json({ message: 'Error fetching bar chart data', error: error.message });
    }
});


    // API for pie chart (categories)
app.get('/api/pie-chart', async (req, res) => {
    const { month } = req.query;

    try {
        const pieChartData = await Transaction.aggregate([
            {
                $match: { dateOfSale: { $regex: month, $options: 'i' } }
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json(pieChartData);
    } catch (error) {
        res.status(500).send('Error fetching pie chart data');
    }
});
// Default route for the root URL
app.get('/', (req, res) => {
    res.send('Welcome to the Transactions API!'); // This will respond to requests at the root URL
});


// API to combine statistics, bar chart, and pie chart
app.get('/api/combined', async (req, res) => {
    const { month } = req.query;

    try {
        const [statistics, barChart, pieChart] = await Promise.all([
            Transaction.aggregate([
                { $match: { dateOfSale: { $regex: month, $options: 'i' } } },
                {
                    $group: {
                        _id: null,
                        totalSaleAmount: { $sum: '$price' },
                        totalSoldItems: { $sum: { $cond: [{ $eq: ['$sold', true] }, 1, 0] } },
                        totalNotSoldItems: { $sum: { $cond: [{ $eq: ['$sold', false] }, 1, 0] } }
                    }
                }
            ]),
            Transaction.aggregate([
                {
                    $match: { dateOfSale: { $regex: month, $options: 'i' } }
                },
                {
                    $bucket: {
                        groupBy: "$price",
                        boundaries: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, Infinity],
                        default: "901-above",
                        output: { count: { $sum: 1 } }
                    }
                }
            ]),
            Transaction.aggregate([
                { $match: { dateOfSale: { $regex: month, $options: 'i' } } },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        res.json({ statistics, barChart, pieChart });
    } catch (error) {
        res.status(500).send('Error fetching combined data');
    }
});

    //API code end
     
    
// Transaction schema
const transactionSchema = new mongoose.Schema({
    title: String,
    description: String,
    price: Number,
    dateOfSale: Date,
    sold: Boolean,
    category: String
});
const Transaction = mongoose.model('Transaction', transactionSchema);

// Fetch data from third-party API and seed database
app.get('/api/seed', async (req, res) => {
    try {
        const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        await Transaction.deleteMany({});
        await Transaction.insertMany(response.data);
        res.status(200).send('Database seeded successfully');
    } catch (error) {
        res.status(500).send('Error seeding database');
    }
});

// List all transactions with pagination and search
app.get('/api/transactions', async (req, res) => {
    const { page = 1, perPage = 10, search = '', month } = req.query;
    const query = {
        $or: [
            { title: new RegExp(search, 'i') },
            { description: new RegExp(search, 'i') },
            { price: new RegExp(search, 'i') }
        ]
    };
    if (month) {
        query.dateOfSale = { $regex: month, $options: 'i' };
    }
    const transactions = await Transaction.find(query)
        .skip((page - 1) * perPage)
        .limit(parseInt(perPage));
    res.json(transactions);
});

// API for Statistics (total sales, sold, unsold)
app.get('/api/statistics', async (req, res) => {
    const { month } = req.query;
    const query = { dateOfSale: { $regex: month, $options: 'i' } };
    const totalSaleAmount = await Transaction.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    const soldItems = await Transaction.countDocuments({ ...query, sold: true });
    const unsoldItems = await Transaction.countDocuments({ ...query, sold: false });

    res.json({
        totalSaleAmount: totalSaleAmount[0]?.total || 0,
        soldItems,
        unsoldItems
    });
});

// API for Bar Chart (price ranges)
app.get('/api/bar-chart', async (req, res) => {
    const { month } = req.query;
    const query = { dateOfSale: { $regex: month, $options: 'i' } };
    const ranges = [
        { range: '0-100', min: 0, max: 100 },
        { range: '101-200', min: 101, max: 200 },
        { range: '201-300', min: 201, max: 300 },
        { range: '301-400', min: 301, max: 400 },
        { range: '401-500', min: 401, max: 500 },
        { range: '501-600', min: 501, max: 600 },
        { range: '601-700', min: 601, max: 700 },
        { range: '701-800', min: 701, max: 800 },
        { range: '801-900', min: 801, max: 900 },
        { range: '901-above', min: 901, max: Infinity }
    ];
    const barChart = await Promise.all(ranges.map(async (r) => {
        const count = await Transaction.countDocuments({
            ...query,
            price: { $gte: r.min, $lte: r.max }
        });
        return { range: r.range, count };
    }));

    res.json(barChart);
});

// API for Pie Chart (categories)
app.get('/api/pie-chart', async (req, res) => {
    const { month } = req.query;
    const query = { dateOfSale: { $regex: month, $options: 'i' } };
    const pieChart = await Transaction.aggregate([
        { $match: query },
        { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    res.json(pieChart);
});

// Combined API
app.get('/api/combined', async (req, res) => {
    const [statistics, barChart, pieChart] = await Promise.all([
        axios.get('http://localhost:3000/api/statistics', { params: req.query }),
        axios.get('http://localhost:3000/api/bar-chart', { params: req.query }),
        axios.get('http://localhost:3000/api/pie-chart', { params: req.query })
    ]);
    res.json({
        statistics: statistics.data,
        barChart: barChart.data,
        pieChart: pieChart.data
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

