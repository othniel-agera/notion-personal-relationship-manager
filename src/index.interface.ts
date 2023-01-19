import { GetPagePropertyResponse } from "@notionhq/client/build/src/api-endpoints";

export interface ContactInterface {
	"Phone Number": { id: string };
	Name: { id: string };
	"Reach out by": { id: string };
}

export interface FilteredContacts {
	id: string;
	properties: ContactInterface;
}

export interface DetailsInterface {
	phoneNumber: string;
	name: string;
	reachOutBy: string;
}
