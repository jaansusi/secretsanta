import { ReadUserDto } from "src/user/dto/read-user.dto";

export class ReadFamilyDto {
    id: number;
    name: string;
    members: ReadUserDto[];
    size: number;
}