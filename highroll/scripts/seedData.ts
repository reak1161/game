import { MongoClient } from 'mongodb';
import { cards, roles, rules } from '../data/initialData';

const uri = process.env.MONGODB_URI || 'your_mongodb_connection_string';
const client = new MongoClient(uri);

async function seedDatabase() {
    try {
        await client.connect();
        const database = client.db('highroll');
        
        const cardsCollection = database.collection('cards');
        const rolesCollection = database.collection('roles');
        const rulesCollection = database.collection('rules');

        await cardsCollection.deleteMany({});
        await rolesCollection.deleteMany({});
        await rulesCollection.deleteMany({});

        await cardsCollection.insertMany(cards);
        await rolesCollection.insertMany(roles);
        await rulesCollection.insertMany(rules);

        console.log('Database seeded successfully!');
    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        await client.close();
    }
}

seedDatabase();