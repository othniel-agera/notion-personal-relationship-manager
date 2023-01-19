import { Client, APIResponseError } from "@notionhq/client";
import twilio from "twilio";
import RestException from "twilio/lib/base/RestException";
import { DetailsInterface } from "./index.interface";

// Initializing a client
const notionClient = new Client({
	auth: process.env.NOTION_AUTH_TOKEN,
});

const getPeopleToReachoutTo = async () => {
	const response = await notionClient.databases.query({
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

const extractContactDetails = async (filteredContactsArray) => {
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
					await notionClient.pages.properties.retrieve({
						page_id: pageId,
						property_id: phoneNumberPropertyId,
					});

				const reachOutByProperty = await notionClient.pages.properties.retrieve(
					{
						page_id: pageId,
						property_id: reachOutByPropertyId,
					}
				);

				const nameProperty = await notionClient.pages.properties.retrieve({
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

(async () => {
	try {
		const peopleToReachOutTo = await getPeopleToReachoutTo();
		const details = await extractContactDetails(peopleToReachOutTo.results);
		for (let detail of details) {
			if (detail.reachOutBy === "text") {
				console.log("Text");
			} else {
				console.log("Just call");
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
		} else {
			console.error(error.message);
		}
	}
})();
