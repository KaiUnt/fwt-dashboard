# api/queries.py
from typing import Dict

class GraphQLQueries:
    GET_SERIES_RANKINGS = """
    query GetSeriesRankings($id: ID!, $divisionId: ID!) {
        series(id: $id) {
            rankings(divisionId: $divisionId) {
                athlete {
                    id
                    name
                    dob
                    nationality
                    image
                }
                place
                points
                results {
                    place
                    points
                    eventDivision {
                        event {
                            name
                            date
                        }
                    }
                }
            }
        }
    }
    """

    GET_DIVISIONS = """
    query GetDivisions($id: ID!) {
        series(id: $id) {
            name
            rankingsDivisions {
                id
                name
            }
        }
    }
    """

    GET_EVENT_ATHLETES = """
    query event($id: ID!) {
        event(id: $id) {
            name
            date
            status
            eventDivisions {
                division {
                    name
                }
                entries {
                    athlete {
                        id
                        name
                        nationality
                        dob
                        image
                    }
                    status
                    bib
                }
                status
            }
        }
    }
    """

    GET_FWT_SERIES = """
    query getFWTGlobalSeries($shortName: String) {
        organisationByShortName(shortName: $shortName) {
            id
            name
            series {
                id
                name
                rankingsDivisions {
                    id
                    name
                }
            }
        }
    }
"""
    GET_ORGANISATION_SERIES = """
    query GetOrganisationSeries($shortName: String!) {
        organisationByShortName(shortName: $shortName) {
            series {
                id
                name
            }
        }
    }
    """
    
    GET_EVENTS_BY_SERIES = """
    query GetEventsBySeries($id: ID!) {
        series(id: $id) {
            events {
                id
                name
                date
            }
        }
    }
    """

    # Lightweight query for seeding - only athlete id and name, no results
    GET_SERIES_ATHLETES_ONLY = """
    query GetSeriesAthletesOnly($id: ID!, $divisionId: ID!) {
        series(id: $id) {
            rankings(divisionId: $divisionId) {
                athlete {
                    id
                    name
                }
            }
        }
    }
    """

    # Live scoring query - get heat results for an event
    GET_EVENT_LIVE_SCORING = """
    query GetEventLiveScoring($id: ID!) {
        event(id: $id) {
            id
            name
            status
            eventDivisions {
                id
                division { name }
                status
                heats {
                    id
                    round
                    status
                    result {
                        athleteId
                        total
                        place
                    }
                    competitors {
                        athleteId
                        athlete {
                            name
                            nationality
                        }
                    }
                }
            }
        }
    }
    """