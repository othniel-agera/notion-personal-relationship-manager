import dotenv from "dotenv";
import { Client, APIResponseError } from "@notionhq/client";
import twilio, { Twilio } from "twilio";
import RestException from "twilio/lib/base/RestException";
import { DetailsInterface } from "./index.interface";

dotenv.config();
export class Util {
	accountSid: string;
	authToken: string;
	myPhoneNumber: string;
	notionClient: Client;
	twilioClient: Twilio;

	constructor() {
		if (!process.env.TWILIO_ACCOUNT_SID) {
			throw new Error("No TWILIO_ACCOUNT_SID in .env");
		}
		if (!process.env.TWILIO_AUTH_TOKEN) {
			throw new Error("No TWILIO_AUTH_TOKEN in .env");
		}
		if (!process.env.TWILIO_PHONE_NUMBER) {
			throw new Error("No TWILIO_PHONE_NUMBER in .env");
		}

		this.accountSid = process.env.TWILIO_ACCOUNT_SID;
		this.authToken = process.env.TWILIO_AUTH_TOKEN;
		this.myPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

		this.notionClient = new Client({
			auth: process.env.NOTION_AUTH_TOKEN,
		});
		this.twilioClient = twilio(this.accountSid, this.authToken);
	}

	getPeopleToReachoutTo = async () => {
		const response = await this.notionClient.databases.query({
			database_id: process.env.NOTION_DATABASE_ID,
			filter: {
				property: "Should Reach Out?",
				checkbox: {
					equals: true,
				},
			},
		});
		return response;
	};

	extractContactDetails = async (filteredContactsArray) => {
		let details: DetailsInterface[];
		if (filteredContactsArray) {
			const neededPageAndPropertiesIds = filteredContactsArray.map(
				(contactObject) => ({
					pageId: contactObject.id,
					phoneNumberPropertyId: contactObject.properties["Phone Number"].id,
					namePropertyId: contactObject.properties["Name"].id,
					reachOutByPropertyId: contactObject.properties["Reach out by"].id,
				})
			);

			const promises = neededPageAndPropertiesIds.map(
				async (pageAndPropertyId) => {
					const {
						pageId,
						phoneNumberPropertyId,
						namePropertyId,
						reachOutByPropertyId,
					} = pageAndPropertyId;

					const phoneNumberProperty =
						await this.notionClient.pages.properties.retrieve({
							page_id: pageId,
							property_id: phoneNumberPropertyId,
						});

					const reachOutByProperty =
						await this.notionClient.pages.properties.retrieve({
							page_id: pageId,
							property_id: reachOutByPropertyId,
						});

					const nameProperty =
						await this.notionClient.pages.properties.retrieve({
							page_id: pageId,
							property_id: namePropertyId,
						});
					return {
						phoneNumber: phoneNumberProperty[phoneNumberProperty.type],
						reachOutBy: reachOutByProperty[reachOutByProperty.type].name,
						name: nameProperty["results"][0]?.title.text.content,
					};
				}
			);

			details = await Promise.all<DetailsInterface>(promises);
		} else {
			throw new Error("You did not provide any list to extract data from.");
		}

		return details;
	};

	sendSMS = async (phoneNumber: string, messageBody: string) => {
		return await this.twilioClient.messages.create({
			body: messageBody,
			from: this.myPhoneNumber,
			to: phoneNumber,
		});
	};

	run = async () => {
		try {
			const peopleToReachOutTo = await this.getPeopleToReachoutTo();
			const details = await this.extractContactDetails(
				peopleToReachOutTo.results
			);
			for (let detail of details) {
				const { name, reachOutBy, phoneNumber } = detail;
				let response;

				if (reachOutBy === "text") {
					const checkInMessage = `Hi ${name}! How have you been? It has been a while and I wanted to say hi. Let's catch up soon. Have a great day!`;
					response = await this.sendSMS(phoneNumber, checkInMessage);
				} else {
					const reminderMessage = `It's been 3 months since you spoke with ${name}. It's time to reach out! Call ${phoneNumber} to say hi to ${name}`;
					response = await this.sendSMS(
						process.env.PHONE_NUMBER_FOR_REMINDERS,
						reminderMessage
					);
				}
			}
			console.log("******************");
			console.log(peopleToReachOutTo);
			console.log(details);
			console.log("*****************");
		} catch (error) {
			if (error instanceof APIResponseError) {
				console.error(
					"Unable to fetch items from database. An error occured from the API client."
				);
				console.error("Error code: " + error.code);
				console.error(error.message);
			} else if (error instanceof RestException) {
				console.error(
					"Unable to send reminder or message. The following error occured: "
				);
				console.error(error.message);
			} else {
				console.error(error.message);
			}
		}
	};
}

new Util().run();
