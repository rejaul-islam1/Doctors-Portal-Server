const express = require('express')
const app = express()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const cors = require('cors');
const res = require('express/lib/response');
const port = process.env.PORT || 5000;


// Middleware 
app.use(cors())
app.use(express.json());





const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.k03sm.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized Access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors-portal').collection('services');
        const bookingCollection = client.db('doctors-portal').collection('booking');
        const userCollection = client.db('doctors-portal').collection('users');

        // Get all service
        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services)
        })


        // Get all Users
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })


        // Get Admin
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        // Create or Upadate Admin
        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updatedDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updatedDoc)
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'Forbidden' })
            }

        })

        // Update or create user
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updatedDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })
            res.send({ result, token });
        })

        // Get Available services
        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 14, 2022';
            //1. Get all services
            const services = await serviceCollection.find().toArray();
            //2. Get the bookings of the day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();
            //3. For each service, find the bookings for that service
            services.forEach(service => {
                const serviceBookings = bookings.filter(b => b.treatment === service.name);
                const booked = serviceBookings.map(s => s.slot);
                const available = service.slots.filter(s => !booked.includes(s));
                service.slots = available;
            })
            res.send(services)
        })

        // Get all Bookings
        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
        })

        // Post one Booking
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({ success: true, result })
        })
    }
    finally {

    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Doctor Uncle!')
})

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})