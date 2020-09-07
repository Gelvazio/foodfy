const db = require("../../config/db");
const { hash } = require("bcryptjs");
const crypto = require("crypto");
const mailer = require("../../lib/mailer");
const  Recipe = require("./Recipe");
const fs = require('fs');
const { find } = require("./Recipe");

module.exports = {
    all() {
        const query = `SELECT * FROM users;`

        return db.query(query);
    },

    isAdmin(id) {
        const query = `SELECT is_admin FROM users WHERE id = $1`;

        return db.query(query, [id])
    },

    async find(id) {
        return db.query(`SELECT * FROM users WHERE id=$1`, [id]);
    },

    async findOne(filters) {
        let query = "SELECT * FROM users";

        Object.keys(filters).map(key => {
            query = `${query} 
            ${key}
            `;

            Object.keys(filters[key]).map(field => {
                query = `${query} ${field} = '${filters[key][field]}'`;
            });
        });

        const results = await db.query(query);
        return results.rows[0];
    },

    async create(data) {
        try {
            const query = `
            INSERT INTO users (
                name,
                email,
                password,
                is_admin
            ) VALUES ($1, $2, $3, $4)
            RETURNING id
        `;

            const token = crypto.randomBytes(8).toString("hex");

            // Hash of password
            const passwordHash = await hash(token, 8);

            let isAdmin = false;

            if (data.isAdmin) {
                isAdmin = true;
            }

            const values = [
                data.name,
                data.email,
                passwordHash,
                isAdmin
            ];

            const results = await db.query(query, values);

            await mailer.sendMail({
                to: data.email,
                from: 'no-reply@foody.com.br',
                subject: 'Seu acesso ao Foodfy',
                html: `<h2>Seu acesso ao Foodfy foi liberado!</h2>
                <p>Utilize a senha ${token} para entrar em sua conta.</p>
                `,
            });

            return results.rows[0].id;

        } catch (err) {
            console.error(err);
        }

    },

    async delete(id) {
        let results = await await db.query(`SELECT recipes.* FROM recipes WHERE recipes.user_id=$1`, [id]);
        const recipes = results.rows;

        const allFilesPromise = recipes.map(recipe => 
            Recipe.files(recipe.id)
        );

        let promiseResults = await Promise.all(allFilesPromise);
        
        for (let index = 0; index < recipes.length; index++) {
            await db.query(`DELETE FROM recipes_files WHERE recipes_files.recipe_id = $1`, [recipes[index].id]);
        }

        await db.query(`DELETE FROM users WHERE id=$1`, [id]);

        promiseResults.map(results => {
            results.rows.map(file => {
                try {
                    fs.unlinkSync(file.path);
                } catch (error) {
                    console.error(error);
                }
            });
        });

    },

}