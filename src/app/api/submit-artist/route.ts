import { NextResponse } from 'next/server';

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwIWTO8aHiq-ieTDbmwoxZihZIqwYVwAD_yQOAtXU26EPN-QhSC08-bDYNcYe3OJRxCWw/exec';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        
        const res = await fetch(GAS_API_URL, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'text/plain',
            },
        });

        if (!res.ok) {
            return NextResponse.json({ status: 'error', message: 'GAS communication failed' }, { status: 500 });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('API Route Error:', error);
        return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
    }
}
