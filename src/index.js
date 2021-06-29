const { ApolloServer, gql } = require('apollo-server');
const { MongoClient, ObjectID } = require('mongodb');

const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

dotenv.config();

process.env.DB_URI;
const { DB_URI, DB_NAME, JWT_SECRET } = process.env;

const getToken = (user) => jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30 days' });
const getUserFromToken = async (token, db) => {
	const tokenData = jwt.verify(token, JWT_SECRET);
	console.log('====================================');
	console.log(tokenData);
	console.log('====================================');
	if (!tokenData?.id) {
		return null;
	}
	return await db.collection('Users').findOne({ _id: ObjectID(tokenData.id) });
};

const typeDefs = gql`
	type Query {
		myTaskList: [TaskList!]!
	}

	type Mutation {
		signUp(input: SignUpInput!): AuthUser!
		signIn(input: SignInInput!): AuthUser!

		createTaskList(title: String!): TaskList!
	}

	input SignUpInput {
		email: String!
		password: String!
		name: String!
		avatar: String
	}

	input SignInInput {
		email: String!
		password: String!
	}

	type AuthUser {
		user: User!
		token: String!
	}

	type User {
		id: ID!
		name: String!
		email: String!
		avatar: String
	}
	type TaskList {
		id: ID!
		createAt: String!
		title: String!
		progress: Float!

		users: [User!]!
		todos: [ToDo!]!
	}

	type ToDo {
		id: ID!
		content: String!
		isCompleted: Boolean!

		taskListId: ID!
		taskList: TaskList
	}
`;

const resolvers = {
	Query: {
		myTaskList: () => [],
	},
	Mutation: {
		signUp: async (_, { input }, { db }) => {
			const hashedPassword = bcrypt.hashSync(input.password);
			const newUser = {
				...input,
				password: hashedPassword,
			};
			//save database
			const result = await db.collection('Users').insertOne(newUser);
			const user = result.ops[0];
			return {
				user,
				token: getToken(user),
			};
		},
		signIn: async (_, { input }, { db }) => {
			const user = await db.collection('Users').findOne({ email: input.email });
			const isPasswordCorrect = user && bcrypt.compareSync(input.password, user.password);
			if (!user || !isPasswordCorrect) {
				throw new Error('Invalid credentials!');
			}

			return {
				user,
				token: getToken(user),
			};
		},
		createTaskList: async (_, { title }, { db, user }) => {
			if (!user) {
				throw new Error('Authentication Error');
			}
		},
	},
	User: {
		id: ({ _id, id }) => _id || id,
	},
};

const start = async () => {
	const client = new MongoClient(DB_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	});
	await client.connect();
	const db = client.db(DB_NAME);

	let context = {
		db,
	};

	// The ApolloServer constructor requires two parameters: your schema
	// definition and your set of resolvers.
	const server = new ApolloServer({
		typeDefs,
		resolvers,
		context: async ({ req }) => {
			const user = await getUserFromToken(req.headers.authorization, db);
			console.log(req);
			return {
				db,
				user,
			};
		},
	});

	// The `listen` method launches a web server.
	server.listen().then(({ url }) => {
		console.log(`🚀  Server ready at ${url}`);
	});
};

start();
